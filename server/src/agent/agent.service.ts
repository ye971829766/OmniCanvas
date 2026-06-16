import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import { AiService } from "../ai/ai.service";
import { EventSink } from "./event-sink";
import type { ToolContext } from "./tool.interface";
import { TOOL_MAP, toOpenAiTools } from "./tool.registry";
import { SYSTEM_PROMPT } from "./system-prompt";
import { AgentMemory } from "./agent.memory";
// No planner imports

/** accumulator for a streamed tool_call */
interface ToolAcc {
  id: string;
  name: string;
  args: string;
}

/** Per-turn usage tracking */
interface TurnUsage {
  promptTokens: number;
  completionTokens: number;
  steps: number;
  toolCalls: number;
  startedAt: number;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly MAX_STEPS = 12;
  private readonly chatModel = process.env.AGENT_CHAT_MODEL || "gpt-4o-mini";
  /** Per-session mutex: prevents concurrent runs on the same session. */
  private readonly sessionLocks = new Map<string, Promise<void>>();

  // ── Timeout configuration ─────────────────────────────────────────────────
  private readonly LLM_TIMEOUT_MS = 30_000;
  private readonly TOOL_TIMEOUT_MS = 20_000;

  constructor(
    private readonly ai: AiService,
    private readonly memory: AgentMemory,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /** Run one user turn; returns an EventSink the controller pipes to SSE. */
  run(sessionId: string, userInput: string, origin: string, images?: string[]): EventSink {
    const sink = new EventSink();
    const doRun = async () => {
      await this.withSessionLock(sessionId, () =>
        this.dispatch(sessionId, userInput, origin, sink, images),
      );
    };
    doRun().catch((e) => {
      this.logger.error(e?.stack || e);
      sink.emit({ type: "error", message: e?.message ?? "agent error" });
      sink.close();
    });
    return sink;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DISPATCHER (REACT LOOP ONLY)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Route the user request to ReAct loop mode.
   */
  private async dispatch(
    sessionId: string,
    userInput: string,
    origin: string,
    sink: EventSink,
    images?: string[],
  ): Promise<void> {
    const usage: TurnUsage = {
      promptTokens: 0,
      completionTokens: 0,
      steps: 0,
      toolCalls: 0,
      startedAt: Date.now(),
    };

    try {
      await this.reactLoop(sessionId, userInput, origin, sink, usage, images);
    } finally {
      const elapsedMs = Date.now() - usage.startedAt;
      this.logger.log(
        `[session=${sessionId}] mode=react ` +
          `steps=${usage.steps} tools=${usage.toolCalls} ` +
          `tokens=${usage.promptTokens}+${usage.completionTokens} ` +
          `elapsed=${elapsedMs}ms`,
      );
      sink.emit({
        type: "usage",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        steps: usage.steps,
        toolCalls: usage.toolCalls,
        elapsedMs,
      } as any);
      sink.emit({ type: "done" });
      sink.close();
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE 2: REACT LOOP (modify existing design)
  // ═══════════════════════════════════════════════════════════════════════════

  private async reactLoop(
    sessionId: string,
    userInput: string,
    origin: string,
    sink: EventSink,
    usage: TurnUsage,
    images?: string[],
  ): Promise<void> {
    const { client, model } = await this.buildClient();

    const history = this.memory.get(sessionId);
    const screenshot = this.memory.getScreenshot(sessionId);

    let userContent: ChatCompletionMessageParam["content"] = userInput;
    if (screenshot || (images && images.length > 0)) {
      const parts: any[] = [{ type: "text", text: userInput }];
      if (screenshot) {
        parts.push({
          type: "image_url",
          image_url: {
            url: screenshot.startsWith("data:")
              ? screenshot
              : `data:image/png;base64,${screenshot}`,
          },
        });
      }
      if (images && images.length > 0) {
        for (const img of images) {
          parts.push({
            type: "image_url",
            image_url: {
              url: img.startsWith("data:") ? img : `data:image/png;base64,${img}`,
            },
          });
        }
      }
      userContent = parts;
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userContent as any },
    ];

    const ctx: ToolContext = {
      sessionId,
      sink,
      ai: this.ai,
      origin,
      newRefId: (prefix = "n") =>
        `${prefix}_${Math.random().toString(36).slice(2, 10)}`,
      memory: this.memory,
    };

    for (let step = 0; step < this.MAX_STEPS; step++) {
      usage.steps = step + 1;

      const { text, toolCalls, chunkUsage } = await this.withTimeout(
        this.streamTurn(client, model, messages, sink),
        this.LLM_TIMEOUT_MS,
        "LLM streaming timed out",
      );

      usage.promptTokens += chunkUsage.promptTokens;
      usage.completionTokens += chunkUsage.completionTokens;

      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls.length
          ? toolCalls.map((t) => ({
              id: t.id,
              type: "function" as const,
              function: { name: t.name, arguments: t.args || "{}" },
            }))
          : undefined,
      } as ChatCompletionMessageParam);

      if (toolCalls.length === 0) {
        sink.emit({ type: "final", text });
        break;
      }

      for (const call of toolCalls) {
        usage.toolCalls++;
        const input = this.safeParse(call.args);
        const validationError = this.validateToolInput(call.name, input);
        if (validationError) {
          sink.emit({
            type: "error",
            message: `${call.name}: ${validationError}`,
          });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Validation error: ${validationError}`,
          });
          continue;
        }

        sink.emit({ type: "tool_call", id: call.id, tool: call.name, input });
        const tool = TOOL_MAP.get(call.name);
        let content: string;
        if (!tool) {
          content = `Unknown tool: ${call.name}`;
        } else {
          try {
            const result = await this.withTimeout(
              tool.execute(input, ctx),
              this.TOOL_TIMEOUT_MS,
              `Tool ${call.name} timed out`,
            );
            sink.emit({
              type: "tool_result",
              id: call.id,
              tool: call.name,
              output: result.output,
            });
            content = JSON.stringify(result.output);
          } catch (e: any) {
            sink.emit({
              type: "error",
              message: `${call.name}: ${e?.message}`,
            });
            content = `Error: ${e?.message ?? "tool failed"}`;
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }

      if (step === this.MAX_STEPS - 1) {
        sink.emit({ type: "final", text: "已达到本轮步数上限。" });
      }
    }

    const historyToSave = messages.filter((m) => m.role !== "system");
    this.memory.set(sessionId, historyToSave as any);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  private async buildClient(): Promise<{ client: OpenAI; model: string }> {
    const route = await this.ai.resolveChannelAndModel("chat", this.chatModel);
    if (!route.channel) {
      throw new Error(
        `没有可用于 chat 模型 "${this.chatModel}" 的渠道,请在渠道管理中配置`,
      );
    }
    return {
      client: new OpenAI({
        apiKey: route.channel.apiKey,
        baseURL: route.channel.baseUrl,
      }),
      model: route.upstreamModel || this.chatModel,
    };
  }

  private async streamTurn(
    client: OpenAI,
    model: string,
    messages: ChatCompletionMessageParam[],
    sink: EventSink,
  ): Promise<{
    text: string;
    toolCalls: ToolAcc[];
    chunkUsage: { promptTokens: number; completionTokens: number };
  }> {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      stream_options: { include_usage: true },
      tools: toOpenAiTools(),
      messages,
      max_tokens: 4096,
      tool_choice: "auto",
    });
    console.log(model);

    let text = "";
    const acc = new Map<number, ToolAcc>();
    const chunkUsage = { promptTokens: 0, completionTokens: 0 };

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      if (chunk.usage) {
        chunkUsage.promptTokens = chunk.usage.prompt_tokens ?? 0;
        chunkUsage.completionTokens = chunk.usage.completion_tokens ?? 0;
      }
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        text += delta.content;
        sink.emit({ type: "thinking", text: delta.content });
      }
      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const cur = acc.get(idx) ?? { id: "", name: "", args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        acc.set(idx, cur);
      }
    }

    const toolCalls = [...acc.values()].filter((t) => t.name);
    toolCalls.forEach((t, i) => {
      if (!t.id) t.id = `call_${i}_${Math.random().toString(36).slice(2, 8)}`;
    });
    return { text, toolCalls, chunkUsage };
  }

  private safeParse(s: string): any {
    if (!s) return {};
    try {
      return JSON.parse(s);
    } catch {
      this.logger.warn(`tool args parse failed: ${s.slice(0, 120)}`);
      return {};
    }
  }

  private validateToolInput(toolName: string, input: any): string | null {
    const tool = TOOL_MAP.get(toolName);
    if (!tool) return null;
    const required = tool.parameters.required ?? [];
    for (const key of required) {
      if (input[key] === undefined || input[key] === null) {
        return `Missing required parameter: "${key}"`;
      }
    }
    const props = tool.parameters.properties;
    for (const [key, schema] of Object.entries(props) as [string, any][]) {
      if (input[key] === undefined) continue;
      if (schema.type === "number" && typeof input[key] !== "number") {
        const num = Number(input[key]);
        if (isNaN(num))
          return `Parameter "${key}" must be a number, got ${typeof input[key]}`;
        input[key] = num;
      }
      if (schema.type === "string" && typeof input[key] !== "string") {
        input[key] = String(input[key]);
      }
      if (schema.enum && !schema.enum.includes(input[key])) {
        return `Parameter "${key}" must be one of [${schema.enum.join(", ")}], got "${input[key]}"`;
      }
    }
    return null;
  }

  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  private async withSessionLock(
    sessionId: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const prev = this.sessionLocks.get(sessionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.sessionLocks.set(sessionId, next);
    try {
      await next;
    } finally {
      if (this.sessionLocks.get(sessionId) === next) {
        this.sessionLocks.delete(sessionId);
      }
    }
  }
}
