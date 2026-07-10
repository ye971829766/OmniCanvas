import { Injectable, Logger } from "@nestjs/common";
import { streamText, type ModelMessage, jsonSchema } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { AiService } from "../ai/ai.service";
import { EventSink } from "./event-sink";
import type { ToolContext, ToolResult } from "./tool.interface";
import { TOOL_MAP } from "./tool.registry";
import { SYSTEM_PROMPT } from "./system-prompt";
import { AgentMemory } from "./agent.memory";
import { ModelConfigService } from "../model-config/model-config.service";
import {
  HiddenReasoningStreamFilter,
  stripHiddenReasoning,
} from "./text-sanitizer";
// No planner imports

/** Extract a meaningful root-cause message from AI SDK wrapped errors. */
function extractErrorMessage(e: any): string {
  if (!e) return "agent error";
  // Drill through cause chain to find the deepest message
  let cause = e?.cause ?? e?.error;
  while (cause?.cause || cause?.error) {
    cause = cause.cause ?? cause.error;
  }
  const body = e?.responseBody ?? cause?.responseBody ?? "";
  if (body) {
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const msg = parsed?.error?.message ?? parsed?.message;
      if (msg) return msg;
    } catch {
      /* ignore */
    }
  }
  return cause?.message ?? e?.message ?? "agent error";
}

/** Per-turn usage tracking */
interface TurnUsage {
  promptTokens: number;
  completionTokens: number;
  steps: number;
  toolCalls: number;
  startedAt: number;
}

import { TokensService } from "../tokens/tokens.service";

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly MAX_STEPS = 100;
  private readonly chatModel = process.env.AGENT_CHAT_MODEL || "gpt-4o-mini";
  /** Per-session mutex: prevents concurrent runs on the same session. */
  private readonly sessionLocks = new Map<string, Promise<void>>();
  private readonly activeRuns = new Map<string, AbortController>();
  /** Generation task states: refId -> { status, url, timestamp } */
  private readonly generationStates = new Map<
    string,
    { status: "generating" | "done" | "error"; url?: string; timestamp: number }
  >();

  // ── Timeout configuration ─────────────────────────────────────────────────
  private readonly LLM_TIMEOUT_MS = 90_000;
  private readonly TOOL_TIMEOUT_MS = 45_000;

  constructor(
    private readonly ai: AiService,
    private readonly memory: AgentMemory,
    private readonly modelConfigService: ModelConfigService,
    private readonly tokensService: TokensService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /** Run one user turn; returns an EventSink the controller pipes to SSE. */
  run(
    sessionId: string,
    userInput: string,
    origin: string,
    images?: string[],
    canvasState?: any[],
    userInfo?: { userId?: string; username?: string },
  ): EventSink {
    const sink = new EventSink();
    const abortController = new AbortController();
    this.activeRuns.set(sessionId, abortController);
    const doRun = async () => {
      await this.withSessionLock(sessionId, () =>
        this.dispatch(
          sessionId,
          userInput,
          origin,
          sink,
          images,
          canvasState,
          abortController.signal,
          userInfo,
        ),
      );
    };
    doRun()
      .catch((e) => {
        if (e?.name === "AbortError" || abortController.signal.aborted) {
          sink.emit({ type: "final", text: "已停止当前任务。" });
        } else {
          this.logger.error(e?.stack || e);
          sink.emit({ type: "error", message: extractErrorMessage(e) });
        }
        sink.close();
      })
      .finally(() => {
        if (this.activeRuns.get(sessionId) === abortController) {
          this.activeRuns.delete(sessionId);
        }
      });
    return sink;
  }

  stop(sessionId: string): boolean {
    const controller = this.activeRuns.get(sessionId);
    if (!controller) return false;
    controller.abort();
    this.activeRuns.delete(sessionId);
    return true;
  }

  updateGenerationState(
    refId: string,
    status: "done" | "error",
    url?: string,
    error?: string,
  ): void {
    this.generationStates.set(refId, { status, url, timestamp: Date.now() });
    this.logger.debug(`Generation state updated: ${refId} -> ${status}`);
  }

  getGenerationState(
    refId: string,
  ): { status: "generating" | "done" | "error"; url?: string } | null {
    const state = this.generationStates.get(refId);
    if (!state) return null;
    // 清理超过5分钟的旧状态
    if (Date.now() - state.timestamp > 300_000) {
      this.generationStates.delete(refId);
      return null;
    }
    return state;
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
    canvasState?: any[],
    abortSignal?: AbortSignal,
    userInfo?: { userId?: string; username?: string },
  ): Promise<void> {
    const usage: TurnUsage = {
      promptTokens: 0,
      completionTokens: 0,
      steps: 0,
      toolCalls: 0,
      startedAt: Date.now(),
    };

    try {
      if (!userInput.trim() && (!images || images.length === 0)) {
        sink.emit({ type: "error", message: "请输入任务内容。" });
        return;
      }
      if (process.env.MOCK_AGENT === "true") {
        await this.dispatchMock(userInput, sink, abortSignal);
        return;
      }
      await this.reactLoop(
        sessionId,
        userInput,
        origin,
        sink,
        usage,
        images,
        canvasState,
        abortSignal,
      );
    } finally {
      const elapsedMs = Date.now() - usage.startedAt;
      this.logger.log(
        `[session=${sessionId}] mode=react ` +
          `steps=${usage.steps} tools=${usage.toolCalls} ` +
          `tokens=${usage.promptTokens}+${usage.completionTokens} ` +
          `elapsed=${elapsedMs}ms`,
      );
      if (usage.promptTokens > 0 || usage.completionTokens > 0) {
        this.tokensService.recordTokenUsage({
          userId: userInfo?.userId,
          username: userInfo?.username,
          model: this.chatModel,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          type: "agent",
        });
      }
      sink.emit({
        type: "usage",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        steps: usage.steps,
        toolCalls: usage.toolCalls,
        elapsedMs,
      } as any);
      if (abortSignal?.aborted) {
        sink.emit({ type: "final", text: "已停止当前任务。" });
      }
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
    canvasState?: any[],
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const config = await this.modelConfigService.getConfig();
    let systemPrompt = config.agentConfig?.systemPrompt || SYSTEM_PROMPT;
    const chatModel = config.agentConfig?.chatModel || this.chatModel;

    try {
      const imageModelsList = await this.modelConfigService.getEnabledMappingsByPurpose("image");
      const videoModelsList = await this.modelConfigService.getEnabledMappingsByPurpose("video");
      const imageModelInfo = imageModelsList.map(m => `- ID: "${m.id}", Name: "${m.label || m.id}"`).join("\n");
      const videoModelInfo = videoModelsList.map(m => `- ID: "${m.id}", Name: "${m.label || m.id}"`).join("\n");

      const modelInstructions = `
<available_models>
When the user mentions a specific model (e.g., "@ModelName" or "@ID") in their prompt, you must choose that model and pass its exact ID string to the "model" parameter of your tool call (e.g., generate_image or generate_video). Do not invent model IDs not listed below.

Available Image Generation Models:
${imageModelInfo || "- None"}

Available Video Generation Models:
${videoModelInfo || "- None"}
</available_models>
`;
      systemPrompt += "\n\n" + modelInstructions;
    } catch (e) {
      this.logger.error("Failed to load models list for system prompt", e);
    }

    const { modelInstance } = await this.buildClient(chatModel);

    const history = this.memory.get(sessionId);
    const screenshot = this.memory.getScreenshot(sessionId);

    let userContent: string | any[] = userInput;
    if (screenshot || (images && images.length > 0)) {
      const parts: any[] = [{ type: "text", text: userInput }];
      if (screenshot) {
        const uploadedUrl = await this.ai.uploadImageToHost(screenshot);
        parts.push({
          type: "image",
          image: uploadedUrl,
        });
      }
      if (images && images.length > 0) {
        for (const img of images) {
          const uploadedUrl = await this.ai.uploadImageToHost(img);
          parts.push({
            type: "image",
            image: uploadedUrl,
          });
        }
      }
      userContent = parts;
    }

    const messages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userContent as any },
    ];

    try {
      const loggedMessages = messages.map((m) => {
        if (typeof m.content === "string") return m;
        if (Array.isArray(m.content)) {
          return {
            ...m,
            content: m.content.map((p: any) =>
              p.type === "image"
                ? {
                    type: "image",
                    image:
                      typeof p.image === "string"
                        ? p.image.slice(0, 100) + "..."
                        : "[Buffer/URL]",
                  }
                : p,
            ),
          };
        }
        return m;
      });
      this.logger.debug(
        `[reactLoop] sending messages to model: ${JSON.stringify(loggedMessages, null, 2)}`,
      );
    } catch (err) {
      this.logger.warn(`Failed to print debug log of messages: ${err}`);
    }

    const ctx: ToolContext = {
      sessionId,
      sink,
      ai: this.ai,
      origin,
      newRefId: (prefix = "n") =>
        `${prefix}_${Math.random().toString(36).slice(2, 10)}`,
      memory: this.memory,
      canvasState: canvasState ?? [],
      abortSignal,
      agentService: this,
    } as any;

    // Convert TOOL_MAP to SDK-compatible tools format
    const sdkTools: Record<string, any> = {};
    for (const [name, tool] of TOOL_MAP.entries()) {
      sdkTools[name] = {
        description: tool.description,
        parameters: jsonSchema(tool.parameters),
      };
    }

    for (let step = 0; step < this.MAX_STEPS; step++) {
      if (abortSignal?.aborted) {
        throw new DOMException("Agent run aborted", "AbortError");
      }
      usage.steps = step + 1;

      // Single turn with streamText
      const result = await this.withTimeout(
        Promise.resolve(
          streamText({
            model: modelInstance,
            messages: messages as any,
            tools: sdkTools,
            toolChoice: "auto",
            abortSignal,
          }),
        ),
        this.LLM_TIMEOUT_MS,
        "LLM streaming timed out",
      );

      let text = "";
      const toolCalls: any[] = [];
      const visibleText = new HiddenReasoningStreamFilter();

      for await (const chunk of result.fullStream) {
        if (abortSignal?.aborted) {
          throw new DOMException("Agent run aborted", "AbortError");
        }
        if (chunk.type === "text-delta") {
          const safeChunk = visibleText.push(chunk.text);
          if (safeChunk) {
            text += safeChunk;
            sink.emit({ type: "thinking", text: safeChunk });
          }
        } else if (chunk.type === "tool-call") {
          toolCalls.push({
            id: chunk.toolCallId,
            name: chunk.toolName,
            args:
              typeof chunk.input === "string"
                ? chunk.input
                : JSON.stringify(chunk.input),
          });
        }
      }

      const trailingText = visibleText.flush();
      if (trailingText) {
        text += trailingText;
        sink.emit({ type: "thinking", text: trailingText });
      }
      text = stripHiddenReasoning(text);

      // Track usage
      const currentUsage = await result.usage;
      usage.promptTokens += currentUsage.inputTokens ?? 0;
      usage.completionTokens += currentUsage.outputTokens ?? 0;

      // Record assistant turn
      const contentParts: any[] = [];
      if (text) {
        contentParts.push({ type: "text" as const, text });
      }
      if (toolCalls.length) {
        contentParts.push(
          ...toolCalls.map((t) => ({
            type: "tool-call" as const,
            toolCallId: t.id,
            toolName: t.name,
            input: JSON.parse(t.args),
          })),
        );
      }
      if (contentParts.length === 0) {
        contentParts.push({ type: "text" as const, text: "" });
      }

      messages.push({
        role: "assistant",
        content: contentParts,
      });

      if (toolCalls.length === 0) {
        sink.emit({ type: "final", text });
        break;
      }

      const stepVisualObservations: any[] = [];
      for (const call of toolCalls) {
        usage.toolCalls++;
        const input = this.safeParse(call.args);
        if (abortSignal?.aborted) {
          throw new DOMException("Agent run aborted", "AbortError");
        }
        const validationError = this.validateToolInput(call.name, input);
        if (validationError) {
          this.logger.warn(
            `[session=${sessionId}] ${call.name}: ${validationError}`,
          );
          messages.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: call.id,
                toolName: call.name,
                output: {
                  type: "text" as const,
                  value: `Validation error: ${validationError}`,
                },
              },
            ],
          });
          continue;
        }

        sink.emit({ type: "tool_call", id: call.id, tool: call.name, input });
        const tool = TOOL_MAP.get(call.name);
        let content: any;
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

            // MCoT visual check image cache handling
            const output = result.output as any;
            if (
              output &&
              typeof output.image === "string" &&
              output.image.startsWith("data:image/")
            ) {
              stepVisualObservations.push({
                image: output.image,
              });
              const strippedOutput = {
                ...output,
                image:
                  "[Base64 Image URL Data - sent as image part in subsequent message]",
              };
              content = strippedOutput;
            } else {
              content = result.output;
            }
          } catch (e: any) {
            let errMsg = e?.message ?? "tool failed";
            this.logger.warn(`[session=${sessionId}] ${call.name}: ${errMsg}`);
            content = { error: errMsg };
          }
        }

        // 🆕 MCoT Checkpoint checklist
        if (
          (call.name === "generate_image" || call.name === "generate_video") &&
          content &&
          content.refId
        ) {
          content.mcotCheckpoint =
            `[MCoT Checkpoint] You have just generated media node "${content.refId}". ` +
            `To ensure premium design quality, you MUST take a screenshot of it using the "export_node_image" tool, ` +
            `and then call "analyze_design" to run a visual self-critique. Do NOT output a final response to the user ` +
            `until you have analyzed the design, evaluated the score, and performed any necessary adjustments.`;
        }

        messages.push({
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: call.id,
              toolName: call.name,
              output:
                typeof content === "string"
                  ? { type: "text" as const, value: content }
                  : { type: "json" as const, value: content as any },
            },
          ],
        });
      }

      // Append visual observations if any
      if (stepVisualObservations.length > 0) {
        const combinedParts: any[] = [];
        for (const obs of stepVisualObservations) {
          const uploadedUrl = await this.ai.uploadImageToHost(obs.image);
          combinedParts.push({ type: "image", image: uploadedUrl });
        }
        messages.push({ role: "user", content: combinedParts });
      }

      if (step === this.MAX_STEPS - 1) {
        sink.emit({
          type: "final",
          text: "已达到安全步数上限（100步），为防止死循环任务已自动停止。",
        });
      }
    }

    const historyToSave = messages.filter((m) => m.role !== "system");
    this.memory.set(sessionId, historyToSave as any);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  private async buildClient(
    chatModel: string,
  ): Promise<{ modelInstance: any }> {
    const route = await this.ai.resolveChannelAndModel("chat", chatModel);
    if (!route.channel) {
      throw new Error(
        `没有可用于 chat 模型 "${chatModel}" 的渠道,请在渠道管理中配置`,
      );
    }
    const customOpenAI = createOpenAI({
      apiKey: route.channel.apiKey,
      baseURL: route.channel.baseUrl,
      fetch: (async (url: string | URL, init: any) => {
        try {
          if (init && init.body && typeof init.body === "string") {
            const body = JSON.parse(init.body);
            if (Array.isArray(body.messages)) {
              let hasModified = false;
              for (const msg of body.messages) {
                if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
                  for (const tc of msg.tool_calls) {
                    if (!tc.thought_signature && !tc.thoughtSignature) {
                      tc.thought_signature = "skip_thought_signature_validator";
                      tc.thoughtSignature = "skip_thought_signature_validator";
                      hasModified = true;
                    }
                    if (!tc.provider_specific_fields) {
                      tc.provider_specific_fields = {};
                      hasModified = true;
                    }
                    if (
                      !tc.provider_specific_fields.thought_signature &&
                      !tc.provider_specific_fields.thoughtSignature
                    ) {
                      tc.provider_specific_fields.thought_signature =
                        tc.thought_signature;
                      tc.provider_specific_fields.thoughtSignature =
                        tc.thoughtSignature;
                      hasModified = true;
                    }
                    if (!tc.extra_content) {
                      tc.extra_content = {};
                      hasModified = true;
                    }
                    if (!tc.extra_content.google) {
                      tc.extra_content.google = {};
                      hasModified = true;
                    }
                    if (
                      !tc.extra_content.google.thought_signature &&
                      !tc.extra_content.google.thoughtSignature
                    ) {
                      tc.extra_content.google.thought_signature =
                        "skip_thought_signature_validator";
                      tc.extra_content.google.thoughtSignature =
                        "skip_thought_signature_validator";
                      hasModified = true;
                    }
                  }
                }
              }
              if (hasModified) {
                init.body = JSON.stringify(body);
              }
            }
          }
        } catch (err) {
          // Ignore parsing errors and fallback to original request
        }
        return fetch(url, init);
      }) as any,
    });
    return {
      modelInstance: customOpenAI.chat(route.upstreamModel || chatModel),
    };
  }

  private async dispatchMock(
    userInput: string,
    sink: EventSink,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const check = () => {
      if (abortSignal?.aborted) throw new DOMException("aborted", "AbortError");
    };
    const uid = () => Math.random().toString(36).slice(2, 10);

    const think = async (text: string) => {
      for (const ch of text) {
        check();
        sink.emit({ type: "thinking", text: ch });
        await wait(14);
      }
    };
    const tool = async (
      name: string,
      input: any,
      outputFn: () => any,
      ms = 600,
    ) => {
      check();
      const id = uid();
      sink.emit({ type: "tool_call", id, tool: name, input });
      await wait(ms);
      check();
      const output = outputFn();
      sink.emit({ type: "tool_result", id, tool: name, output });
      return output;
    };

    const q = userInput.trim().toLowerCase();
    const isDesign =
      /海报|banner|图|设计|生成|做|创建|制作|layout|poster|logo|品牌|视频|配色|画布|card|封面/.test(
        q,
      );
    const isGreeting =
      !isDesign &&
      (q.length < 12 ||
        /^(hi|hello|你好|嗨|hey|test|ok|哈|在吗|是的|好的|嗯|谢|谢谢|thanks)/.test(
          q,
        ));
    const isQuestion =
      !isDesign && /\?|？|什么|怎么|如何|能不能|可以|会不会|介绍/.test(q);

    if (isGreeting) {
      const replies = [
        "嗨！有什么设计想法想聊聊？",
        "你好～告诉我你想做什么，我来帮你把它变成现实。",
        "嗯，我在。有设计需求直接说就好。",
      ];
      const reply = replies[Math.floor(Math.random() * replies.length)] ?? "";
      await think(reply);
      sink.emit({ type: "final", text: reply });
      return;
    }

    if (isQuestion) {
      const reply = `我是 AI 设计助手，可以在画布上帮你生成海报、Banner、图片、视频，以及做排版和配色。直接描述你的需求就好，比如"做一张咖啡店开业海报，暖色调"。`;
      await think(reply);
      sink.emit({ type: "final", text: reply });
      return;
    }

    // --- Design task: full mock workflow ---
    const frameId = "agent_frame";

    await tool(
      "plan_design",
      { request: userInput, deliverables: ["1080×1080 海报"] },
      () => ({
        plan: {
          totalSteps: 4,
          steps: [
            { step: 1, title: "设置画布" },
            { step: 2, title: "生成主图" },
            { step: 3, title: "添加文字" },
            { step: 4, title: "视觉质检" },
          ],
        },
        note: "已生成 4 步计划。",
      }),
      350,
    );

    await tool(
      "set_frame",
      { width: 1080, height: 1080, background: "#0a0e1a" },
      () => {
        sink.canvas({
          op: "set_frame",
          width: 1080,
          height: 1080,
          background: "#0a0e1a",
        });
        return { note: "Frame set to 1080×1080." };
      },
      250,
    );

    const imgId = `img_${uid()}`;
    await tool(
      "generate_image",
      { prompt: userInput, aspectRatio: "1:1", parentId: frameId },
      () => {
        sink.canvas({
          op: "add_node",
          node: {
            refId: imgId,
            type: "rect",
            parentId: frameId,
            x: 0,
            y: 0,
            width: 1080,
            height: 680,
            fill: {
              type: "linear",
              stops: [
                { offset: 0, color: "#1a1f5e" },
                { offset: 1, color: "#4f1a8a" },
              ],
            } as any,
          },
        });
        return { refId: imgId, note: "图片占位节点已放置（Mock）。" };
      },
      700,
    );

    const titleId = `txt_${uid()}`;
    await tool(
      "add_text",
      {
        text: "MOCK DESIGN",
        fontSize: 72,
        fontWeight: "bold",
        fill: "#ffffff",
        x: 80,
        y: 720,
        parentId: frameId,
      },
      () => {
        sink.canvas({
          op: "add_node",
          node: {
            refId: titleId,
            type: "text",
            parentId: frameId,
            text: "MOCK DESIGN",
            fontSize: 72,
            fontWeight: "bold",
            fill: "#ffffff",
            x: 80,
            y: 720,
            width: 920,
          },
        });
        return { refId: titleId };
      },
      250,
    );

    await tool(
      "verify_design",
      { refId: frameId, requirements: userInput },
      () => ({
        success: true,
        score: 9,
        note: "✅ 设计通过质检（评分 9/10）。",
      }),
      450,
    );

    const summary = `设计完成！\n\n> ⓘ **Mock 模式**：图片以色块占位，关闭 \`MOCK_AGENT\` 可切换真实生成。`;
    sink.emit({ type: "final", text: summary });
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
        const num = this.coerceNumber(input[key]);
        if (num === null)
          return `Parameter "${key}" must be a number, got ${typeof input[key]}`;
        input[key] = num;
      }
      if (schema.type === "string" && typeof input[key] !== "string") {
        input[key] = this.coerceString(input[key]);
      }
      if (schema.enum && !schema.enum.includes(input[key])) {
        input[key] = this.normalizeEnumValue(key, input[key], schema.enum);
      }
      if (schema.enum && !schema.enum.includes(input[key])) {
        return `Parameter "${key}" must be one of [${schema.enum.join(", ")}], got "${input[key]}"`;
      }
    }
    return null;
  }

  private coerceNumber(value: unknown): number | null {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const exact = Number(trimmed);
      if (Number.isFinite(exact)) return exact;
      const match = trimmed.match(/-?\d+(?:\.\d+)?/);
      if (!match) return null;
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const parsed = this.coerceNumber(item);
        if (parsed !== null) return parsed;
      }
      return null;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const preferredKeys = [
        "value",
        "number",
        "amount",
        "px",
        "pixels",
        "ratio",
        "lineHeight",
        "fontSize",
        "width",
        "height",
        "x",
        "y",
      ];
      for (const key of preferredKeys) {
        if (record[key] !== undefined) {
          const parsed = this.coerceNumber(record[key]);
          if (parsed !== null) return parsed;
        }
      }
      for (const item of Object.values(record)) {
        const parsed = this.coerceNumber(item);
        if (parsed !== null) return parsed;
      }
    }
    return null;
  }

  private coerceString(value: unknown): string {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["value", "text", "label", "name", "color"]) {
        if (record[key] !== undefined) return String(record[key]);
      }
    }
    return String(value);
  }

  private normalizeEnumValue(
    key: string,
    value: unknown,
    choices: string[],
  ): string {
    const raw = String(value).trim().toLowerCase();
    if (key === "fontWeight") {
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        if (numeric >= 600 && choices.includes("bold")) return "bold";
        if (numeric <= 300 && choices.includes("light")) return "light";
        if (choices.includes("normal")) return "normal";
      }
      if (
        ["semibold", "medium", "heavy", "black"].includes(raw) &&
        choices.includes("bold")
      ) {
        return "bold";
      }
      if (["regular", "book"].includes(raw) && choices.includes("normal")) {
        return "normal";
      }
    }
    if (key === "textAlign") {
      if (["middle", "centre"].includes(raw) && choices.includes("center"))
        return "center";
      if (["start"].includes(raw) && choices.includes("left")) return "left";
      if (["end"].includes(raw) && choices.includes("right")) return "right";
    }
    return String(value);
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
