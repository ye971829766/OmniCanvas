import { Injectable, Logger, Optional } from "@nestjs/common";
import { streamText, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { AiService } from "../ai/ai.service";
import { EventSink } from "./event-sink";
import type { ToolContext, ToolResult } from "./tool.interface";
import { TOOL_MAP } from "./tool.registry";
import { compactAgentSystemPrompt } from "./system-prompt";
import { AgentMemory } from "./agent.memory";
import { ModelConfigService } from "../model-config/model-config.service";
import { BillingService } from "../billing/billing.service";
import {
  HiddenReasoningStreamFilter,
  stripHiddenReasoning,
} from "./text-sanitizer";
// No planner imports

/** Extract a meaningful root-cause message from AI SDK wrapped errors. */
function extractErrorMessage(e: any): string {
  if (!e) return "agent error";
  try {
    const response = typeof e?.getResponse === "function" ? e.getResponse() : undefined;
    if (typeof response === "string" && response) return response;
    if (response?.error) return String(response.error);
    if (response?.message) return String(response.message);
  } catch {}
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
  modelCalls: number;
  peakPromptTokens: number;
  lastPromptTokens: number;
  model: string;
  startedAt: number;
}

function requestsModelCatalog(userInput: string): boolean {
  return /(?:\[modelId:[^\]]+\]|@[\w.-]+|\bmodel\b|\u6a21\u578b)/i.test(userInput);
}

const GENERATION_TOOL_NAMES = new Set([
  "generate_image",
  "generate_video",
  "remove_background",
  "upscale_image",
  "inpaint_image",
  "edit_image",
]);

const GENERATED_MEDIA_DEPENDENT_TOOLS = new Set([
  "verify_design",
  "export_node_image",
  "review_and_adjust",
  "analyze_design",
  "remove_background",
  "upscale_image",
  "inpaint_image",
  "edit_image",
]);

import { TokensService } from "../tokens/tokens.service";
import { FilesService } from "../files/files.service";
import {
  formatAgentAssetForPrompt,
  normalizeAgentAssets,
  type AgentAsset,
  type AgentAssetInput,
} from "./agent-assets";
import { sanitizeCanvasState } from "./canvas-context";
import {
  isDirectImageRequest,
  selectAgentToolNames,
} from "./tool-selection";
import {
  hasCanvasImages,
  normalizeImageToolCallForSelection,
  resolveImplicitImageReference,
} from "./implicit-image-reference";
import { buildAgentSdkTools } from "./sdk-tools";
import { InvalidToolCallGuard } from "./invalid-tool-call-guard";
import { upsertCanvasNode } from "./canvas-state";
import {
  waitForGenerationTasks,
  type PendingGenerationTask,
  type SettledGenerationTask,
} from "./generation-lifecycle";

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly MAX_STEPS = Math.max(
    8,
    Number(process.env.AGENT_MAX_STEPS) || 40,
  );
  private readonly MAX_PROMPT_TOKENS_PER_TURN = Math.max(
    50_000,
    Number(process.env.AGENT_MAX_PROMPT_TOKENS) || 300_000,
  );
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
  private readonly TOOL_TIMEOUT_MS = 75_000;
  private readonly GENERATION_TIMEOUT_MS = Math.max(
    30_000,
    Number(process.env.AGENT_GENERATION_TIMEOUT_MS) || 15 * 60_000,
  );
  private readonly VIDEO_GENERATION_TIMEOUT_MS = Math.max(
    this.GENERATION_TIMEOUT_MS,
    Number(process.env.AGENT_VIDEO_GENERATION_TIMEOUT_MS) || 55 * 60_000,
  );
  private readonly GENERATION_POLL_MS = Math.max(
    250,
    Number(process.env.AGENT_GENERATION_POLL_MS) || 1_000,
  );

  constructor(
    private readonly ai: AiService,
    private readonly memory: AgentMemory,
    private readonly modelConfigService: ModelConfigService,
    private readonly tokensService: TokensService,
    private readonly filesService: FilesService,
    @Optional() private readonly billingService?: BillingService,
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
    userInfo?: { userId?: string; username?: string; requestId?: string },
    assets?: AgentAssetInput[],
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
          assets,
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
      })
      .finally(() => {
        sink.emit({ type: "done" });
        sink.close();
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
    userInfo?: { userId?: string; username?: string; requestId?: string },
    assets?: AgentAssetInput[],
  ): Promise<void> {
    const usage: TurnUsage = {
      promptTokens: 0,
      completionTokens: 0,
      steps: 0,
      toolCalls: 0,
      modelCalls: 0,
      peakPromptTokens: 0,
      lastPromptTokens: 0,
      model: this.chatModel,
      startedAt: Date.now(),
    };

    try {
      if (
        !userInput.trim() &&
        (!images || images.length === 0) &&
        (!assets || assets.length === 0)
      ) {
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
        assets,
        userInfo,
      );
    } finally {
      const elapsedMs = Date.now() - usage.startedAt;
      this.logger.log(
        `[session=${sessionId}] mode=react ` +
          `steps=${usage.steps} tools=${usage.toolCalls} ` +
          `calls=${usage.modelCalls} peak=${usage.peakPromptTokens} ` +
          `tokens=${usage.promptTokens}+${usage.completionTokens} ` +
          `elapsed=${elapsedMs}ms`,
      );
      if (usage.promptTokens > 0 || usage.completionTokens > 0) {
        this.tokensService.recordTokenUsage({
          userId: userInfo?.userId,
          username: userInfo?.username,
          model: usage.model,
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
        modelCalls: usage.modelCalls,
        peakPromptTokens: usage.peakPromptTokens,
        lastPromptTokens: usage.lastPromptTokens,
        elapsedMs,
      } as any);
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
    incomingAssets?: AgentAssetInput[],
    userInfo?: { userId?: string; username?: string; requestId?: string },
  ): Promise<void> {
    const config = await this.modelConfigService.getConfig();
    let systemPrompt = compactAgentSystemPrompt(config.agentConfig?.systemPrompt);
    const chatModel = config.agentConfig?.chatModel || this.chatModel;
    usage.model = chatModel;

    if (requestsModelCatalog(userInput)) {
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
    }

    const { modelInstance } = await this.buildClient(chatModel);

    const history = this.memory.get(sessionId);
    const screenshot = this.memory.consumeScreenshot(sessionId);
    const normalizedAssets = normalizeAgentAssets(incomingAssets);
    const currentAssets: AgentAsset[] = [];
    for (const asset of normalizedAssets) {
      if (asset.publicUrl) {
        currentAssets.push(asset);
        continue;
      }
      const publicUrl = await this.ai.uploadImageToHost(asset.url);
      currentAssets.push(
        /^https?:\/\//i.test(publicUrl) &&
          !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(
            publicUrl,
          )
          ? { ...asset, publicUrl }
          : asset,
      );
    }
    const sessionAssets = this.memory.registerAssets(sessionId, currentAssets);
    const safeCanvasState = sanitizeCanvasState(canvasState ?? []);
    const canvasHasImages = hasCanvasImages(safeCanvasState);
    const implicitImageReference = resolveImplicitImageReference(
      safeCanvasState,
      history as any[],
    );
    const directImageRequest = isDirectImageRequest(userInput);
    const currentTurnAsset = currentAssets.length === 1 ? currentAssets[0] : undefined;
    const defaultImageReferenceIds = currentTurnAsset
      ? [currentTurnAsset.id]
      : currentAssets.length === 0 && implicitImageReference
        ? [implicitImageReference.refId]
        : [];
    if (implicitImageReference?.url) {
      const referencedNode = safeCanvasState.find(
        (node: any) => node.refId === implicitImageReference.refId,
      );
      if (referencedNode && !referencedNode.url) {
        referencedNode.url = implicitImageReference.url;
      }
    }
    const selectedToolNames = selectAgentToolNames({
      userInput,
      canvasNodeCount: safeCanvasState.length,
      hasAssets: sessionAssets.length > 0 || !!images?.length,
      hasCanvasImages: canvasHasImages,
    });
    systemPrompt += `\n\n<active_tools>\n${[...selectedToolNames].join(", ")}\n</active_tools>\n<frame_policy>Frames are optional. Use the root canvas or a Group by default. Create a frame only for a bounded, clipped, exportable, auto-layout, or multi-deliverable composition. If set_frame/add_frame is not listed above, do not create or assume agent_frame.</frame_policy>\nOnly call tools listed above. Issue independent tool calls together in the same response. For nested batches, assign explicit refId values to new frames/groups/nodes and reuse them as parentId. Wait for a result only when a later call depends on generated output.`;
    if (directImageRequest) {
      systemPrompt += `\n\n<current_final_image_request>\nSend this final image request directly to generate_image without planning, decomposition, or verification. Use your judgment to write a concise generation prompt that faithfully conveys the user's intent. Preserve the user's wording when it is already sufficient; otherwise make only the changes needed for the image model to understand the request. Do not invent product facts, creative directions, layouts, copy, or constraints that the user did not imply. If the user explicitly requests multiple separate outputs, make direct generation calls without inventing an intermediate plan.\n</current_final_image_request>`;
    }
    if (implicitImageReference) {
      const selectionDefault = implicitImageReference.reason === "selected"
        ? ` This is the user's single explicit image selection. For an unrelated fresh generation, pass refImages: [] explicitly; otherwise an omitted refImages field inherits this selection.`
        : "";
      systemPrompt += `\n\n<available_canvas_image_target>\nIf the current request refers to an existing image, the best implicit target is canvas refId "${implicitImageReference.refId}". Use edit_image with that source for changes inside the image.${selectionDefault} This is context, not a command: ignore it for a fresh image request.\n</available_canvas_image_target>`;
    }
    if (sessionAssets.length > 0) {
      systemPrompt += `\n\n<session_assets>\n${sessionAssets
        .slice(-16)
        .map((asset) => formatAgentAssetForPrompt(asset))
        .join("\n")}\n</session_assets>\nThese are durable session assets. Use exact IDs and never invent one.`;
    }

    let userContent: string | any[] = userInput;
    if (screenshot || currentAssets.length > 0 || (images && images.length > 0)) {
      const assetContext = currentAssets.length
        ? `\n\n<attached_assets>\n${currentAssets
            .map((asset) => formatAgentAssetForPrompt(asset, true))
            .join("\n")}\n</attached_assets>\nUse these exact assetId values in image tools. Do not invent asset IDs.`
        : "";
      const parts: any[] = [{ type: "text", text: `${userInput}${assetContext}` }];
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
      for (const asset of currentAssets) {
        parts.push({
          type: "image",
          image:
            asset.publicUrl || (await this.ai.uploadImageToHost(asset.url)),
        });
      }
      userContent = parts;
    }

    const currentUserMessage = {
      role: "user" as const,
      content: userContent as any,
    };
    const messages: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      currentUserMessage,
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
      files: this.filesService,
      origin,
      newRefId: (prefix = "n") =>
        `${prefix}_${Math.random().toString(36).slice(2, 10)}`,
      memory: this.memory,
      canvasState: safeCanvasState,
      assets: sessionAssets,
      abortSignal,
      userInput,
      directImageRequest,
      defaultImageReferenceIds,
      userId: userInfo?.userId,
      billing: this.billingService,
      billingNamespace: userInfo?.requestId || `agent:${sessionId}:${usage.startedAt}`,
      agentService: this,
    } as any;

    const sdkTools = buildAgentSdkTools(selectedToolNames);
    const invalidToolCallGuard = new InvalidToolCallGuard();
    let selectedImageWasInspected = false;

    for (let step = 0; step < this.MAX_STEPS; step++) {
      if (abortSignal?.aborted) {
        throw new DOMException("Agent run aborted", "AbortError");
      }
      if (usage.promptTokens >= this.MAX_PROMPT_TOKENS_PER_TURN) {
        sink.emit({
          type: "final",
          text: "已达到本轮 Agent 输入 token 预算，任务已安全停止。可继续发送指令从当前画布状态接着执行。",
        });
        break;
      }
      usage.steps = step + 1;

      // Single turn with streamText
      const modelMessages = this.memory.compactForModel(messages);
      let text = "";
      const toolCalls: any[] = [];
      let llmBillingOperationId: string | undefined;
      try {
        const maxOutputTokens = 4_096;
        if (this.billingService && userInfo?.userId) {
          const promptTokenUpperBound =
            Buffer.byteLength(JSON.stringify(modelMessages), "utf8") +
            Buffer.byteLength(
              JSON.stringify(
                [...selectedToolNames].map((name) => {
                  const tool = TOOL_MAP.get(name);
                  return tool
                    ? { name: tool.name, description: tool.description, parameters: tool.parameters }
                    : { name };
                }),
              ),
              "utf8",
            ) +
            8_192;
          const billingOperation = this.billingService.reserve({
            userId: userInfo.userId,
            idempotencyKey: `${ctx.billingNamespace}:llm:${step}`,
            operation: "llm_chat",
            params: {
              model: chatModel,
              promptTokens: promptTokenUpperBound,
              completionTokens: maxOutputTokens,
            },
            metadata: { source: "agent", sessionId, step },
          });
          llmBillingOperationId = billingOperation.id;
          if (billingOperation.reused && billingOperation.status !== "reserved") {
            throw new Error("This Agent model step was already finalized");
          }
        }
        const result = await this.withTimeout(
          Promise.resolve(
            streamText({
              model: modelInstance,
              messages: modelMessages as any,
              tools: sdkTools,
              toolChoice: "auto",
              maxOutputTokens,
              abortSignal,
            }),
          ),
          this.LLM_TIMEOUT_MS,
          "LLM streaming timed out",
        );
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

        for (const call of toolCalls) {
          const normalizedInput = this.normalizeToolInput(
            call.name,
            this.safeParse(call.args),
          );
          const normalizedCall = normalizeImageToolCallForSelection(
            call.name,
            normalizedInput,
            implicitImageReference,
            {
              userInput,
              selectedImageWasInspected,
            },
          );
          call.name = normalizedCall.toolName;
          call.input = normalizedCall.input;
        }

        // Track and settle actual usage, releasing the conservative preauth gap.
        const currentUsage = await result.usage;
        const currentPromptTokens = currentUsage.inputTokens ?? 0;
        const currentCompletionTokens = currentUsage.outputTokens ?? 0;
        usage.modelCalls++;
        usage.lastPromptTokens = currentPromptTokens;
        usage.peakPromptTokens = Math.max(usage.peakPromptTokens, currentPromptTokens);
        usage.promptTokens += currentPromptTokens;
        usage.completionTokens += currentCompletionTokens;
        if (llmBillingOperationId && this.billingService) {
          const actual = this.billingService.quoteForOperation(llmBillingOperationId, {
            model: chatModel,
            promptTokens: currentPromptTokens,
            completionTokens: currentCompletionTokens,
          });
          this.billingService.capture(llmBillingOperationId, actual.amountMicros);
        }
        this.logger.debug(
          `[session=${sessionId}] step=${step + 1} ` +
            `input=${currentPromptTokens} output=${currentCompletionTokens} ` +
            `cumulativeInput=${usage.promptTokens} activeTools=${selectedToolNames.size}`,
        );
      } catch (error: any) {
        if (llmBillingOperationId && this.billingService) {
          this.billingService.release(llmBillingOperationId, error?.message || "Agent model call failed");
        }
        throw error;
      }

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
            input: t.input,
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
      const pendingGenerationTasks: PendingGenerationTask[] = [];
      const generationOutputs = new Map<string, Record<string, any>>();
      let validToolCalls = 0;
      for (const call of toolCalls) {
        usage.toolCalls++;
        const input = call.input;
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
        validToolCalls++;

        if (
          pendingGenerationTasks.length > 0 &&
          this.requiresGeneratedMedia(
            call.name,
            input,
            pendingGenerationTasks,
          )
        ) {
          await this.settlePendingGenerations(
            pendingGenerationTasks,
            generationOutputs,
            ctx,
            sink,
            abortSignal,
          );
        }

        sink.emit({ type: "tool_call", id: call.id, tool: call.name, input });
        if (!directImageRequest) {
          this.memory.updatePlanForTool(sessionId, call.name, input, false);
        }
        const tool = TOOL_MAP.get(call.name);
        let content: any;
        if (!tool) {
          content = { status: "error", error: `Unknown tool: ${call.name}` };
          sink.emit({
            type: "tool_result",
            id: call.id,
            tool: call.name,
            output: content,
          });
          if (!directImageRequest) {
            this.memory.updatePlanForTool(
              sessionId,
              call.name,
              input,
              true,
              true,
            );
          }
        } else {
          ctx.billingToolCallId = call.id;
          try {
            const result = await this.withTimeout(
              tool.execute(input, ctx),
              this.TOOL_TIMEOUT_MS,
              `Tool ${call.name} timed out`,
            );
            const output = result.output as any;
            const toolReportedFailure =
              call.name === "verify_design" && output?.success !== true;
            sink.emit({
              type: "tool_result",
              id: call.id,
              tool: call.name,
              output: result.output,
            });
            if (!directImageRequest) {
              this.memory.updatePlanForTool(
                sessionId,
                call.name,
                input,
                true,
                toolReportedFailure,
              );
            }

            // MCoT visual check image cache handling
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
            this.capturePendingGeneration(
              call.id,
              call.name,
              result.output,
              pendingGenerationTasks,
              generationOutputs,
            );
          } catch (e: any) {
            const errMsg = extractErrorMessage(e);
            this.logger.warn(`[session=${sessionId}] ${call.name}: ${errMsg}`);
            content = { status: "error", error: errMsg };
            sink.emit({
              type: "tool_result",
              id: call.id,
              tool: call.name,
              output: content,
            });
            if (!directImageRequest) {
              this.memory.updatePlanForTool(
                sessionId,
                call.name,
                input,
                true,
                true,
              );
            }
          } finally {
            delete ctx.billingToolCallId;
          }
        }

        if (
          call.name === "query_canvas" &&
          implicitImageReference?.reason === "selected" &&
          content &&
          !content.error &&
          (content.scope === "selection" ||
            (Array.isArray(content.selectedRefIds) &&
              content.selectedRefIds.includes(implicitImageReference.refId)))
        ) {
          selectedImageWasInspected = true;
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

      if (pendingGenerationTasks.length > 0) {
        await this.settlePendingGenerations(
          pendingGenerationTasks,
          generationOutputs,
          ctx,
          sink,
          abortSignal,
        );
      }

      if (invalidToolCallGuard.recordStep(toolCalls.length, validToolCalls)) {
        sink.emit({
          type: "final",
          text:
            "模型连续返回了无效的工具参数，任务已停止以避免重复消耗。请重试；如果问题持续，请切换到支持标准 OpenAI 工具调用的模型。",
        });
        break;
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
          text: `已达到安全步数上限（${this.MAX_STEPS} 步），为防止死循环，任务已自动停止。`,
        });
      }
    }

    const historyToSave = messages
      .filter((m) => m.role !== "system")
      .map((message) => {
        if (
          message !== currentUserMessage ||
          currentAssets.length === 0 ||
          !Array.isArray((message as any).content)
        ) {
          return message;
        }

        const nonImageParts = (message as any).content.filter(
          (part: any) => part?.type !== "image",
        );
        return {
          ...message,
          content: [
            ...nonImageParts,
            ...currentAssets.map((asset) => ({
              type: "image" as const,
              image: asset.url,
            })),
          ],
        } as ModelMessage;
      });
    this.memory.set(sessionId, historyToSave as any);
  }

  private capturePendingGeneration(
    toolCallId: string,
    toolName: string,
    output: unknown,
    pending: PendingGenerationTask[],
    outputs: Map<string, Record<string, any>>,
  ): void {
    if (
      !GENERATION_TOOL_NAMES.has(toolName) ||
      !output ||
      typeof output !== "object"
    ) {
      return;
    }

    const value = output as Record<string, any>;
    const taskId = typeof value.taskId === "string" ? value.taskId : "";
    const refId = typeof value.refId === "string" ? value.refId : "";
    if (!taskId || !refId) return;

    pending.push({
      taskId,
      refId,
      kind: toolName === "generate_video" ? "video" : "image",
      toolCallId,
      toolName,
    });
    outputs.set(taskId, value);
  }

  private requiresGeneratedMedia(
    toolName: string,
    input: Record<string, any>,
    pending: PendingGenerationTask[],
  ): boolean {
    if (GENERATED_MEDIA_DEPENDENT_TOOLS.has(toolName)) return true;
    if (
      toolName === "generate_image" &&
      pending.some((task) =>
        task.toolName === "upscale_image" || task.toolName === "remove_background"
      )
    ) {
      return true;
    }
    const refs = Array.isArray(input?.refImages) ? input.refImages : [];
    return refs.some((ref: unknown) =>
      pending.some((task) => task.refId === ref),
    );
  }

  private async settlePendingGenerations(
    pending: PendingGenerationTask[],
    outputs: Map<string, Record<string, any>>,
    ctx: ToolContext,
    sink: EventSink,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const tasks = pending.splice(0, pending.length);
    if (tasks.length === 0) return;
    const timeoutMs = tasks.some((task) => task.kind === "video")
      ? this.VIDEO_GENERATION_TIMEOUT_MS
      : this.GENERATION_TIMEOUT_MS;

    sink.emit({
      type: "progress",
      tool: "generate_media",
      message: `Waiting for ${tasks.length} media generation task(s) to finish...`,
      percent: 0,
    });

    const settled = await waitForGenerationTasks(tasks, {
      getTaskStatus: (taskId) => this.ai.getTaskStatus(taskId),
      abortSignal,
      timeoutMs,
      pollIntervalMs: this.GENERATION_POLL_MS,
      onProgress: (completed, total) => {
        sink.emit({
          type: "progress",
          tool: "generate_media",
          message: `Media generation progress: ${completed}/${total}`,
          percent: Math.round((completed / total) * 100),
        });
      },
    });

    for (const task of settled) {
      const output = outputs.get(task.taskId);
      this.applySettledGeneration(task, output, ctx);
      if (task.toolCallId && task.toolName && output) {
        // The first result announces the async task and lets the UI render a
        // progress card. Send the same tool call's terminal result after the
        // task settles so live chat does not remain stuck at "generating".
        sink.emit({
          type: "tool_result",
          id: task.toolCallId,
          tool: task.toolName,
          output,
        });
      }
      outputs.delete(task.taskId);
    }

    const timedOut = settled.filter((task) => task.status === "timeout");
    if (timedOut.length > 0) {
      throw new Error(
        `${timedOut.length} media generation task(s) did not finish within ${Math.round(timeoutMs / 1000)} seconds`,
      );
    }
  }

  private applySettledGeneration(
    task: SettledGenerationTask,
    output: Record<string, any> | undefined,
    ctx: ToolContext,
  ): void {
    const imageUrl = task.state?.imageUrl;
    const videoUrl = task.state?.videoUrl;
    const thumbnailUrl =
      typeof task.state?.thumbnailUrl === "string"
        ? task.state.thumbnailUrl
        : undefined;
    const url = imageUrl || videoUrl;
    const successful = task.status === "success";
    const error = task.error || String(task.state?.error || "Generation failed");

    if (output) {
      output.status = successful ? "success" : "error";
      if (url) output.url = url;
      if (videoUrl) output.videoUrl = videoUrl;
      // Critical for agent chat previews: never leave the UI with only a .mp4 URL
      // for an <img> tag — always surface the poster/thumbnail when available.
      if (thumbnailUrl) output.thumbnailUrl = thumbnailUrl;
      if (!successful) output.error = error;
      output.note = successful
        ? "Media generation completed. Continue the remaining canvas task."
        : `Media generation failed: ${error}`;
    }

    upsertCanvasNode(ctx, task.refId, {
      taskId: task.taskId,
      status: successful ? "done" : "error",
      generationStatus: successful ? "done" : "error",
      ...(url
        ? task.kind === "video"
          ? {
              url: videoUrl || url,
              videoUrl: videoUrl || url,
              ...(thumbnailUrl ? { thumbnailUrl } : {}),
            }
          : { url }
        : {}),
      ...(!successful ? { errorMessage: error } : {}),
    });
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
        return this.ai.fetchProvider(url, init);
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

    // --- Design task: mock workflow follows the same optional-frame policy ---
    const mockToolNames = selectAgentToolNames({
      userInput,
      canvasNodeCount: 0,
      hasAssets: false,
    });
    const usePrimaryFrame = mockToolNames.has("set_frame");
    const useAdditionalFrame = !usePrimaryFrame && mockToolNames.has("add_frame");
    const frameId = usePrimaryFrame
      ? "agent_frame"
      : useAdditionalFrame
        ? `frame_${uid()}`
        : undefined;

    if (mockToolNames.has("plan_design")) await tool(
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

    if (usePrimaryFrame) await tool(
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

    if (useAdditionalFrame && frameId) await tool(
      "add_frame",
      { refId: frameId, width: 1080, height: 1080, x: 0, y: 0 },
      () => {
        sink.canvas({
          op: "add_node",
          node: {
            refId: frameId,
            type: "frame",
            width: 1080,
            height: 1080,
            x: 0,
            y: 0,
            fill: "#0a0e1a",
          },
        });
        return { refId: frameId, note: "Added a bounded mock artboard." };
      },
      250,
    );

    const imgId = `img_${uid()}`;
    await tool(
      "generate_image",
      {
        prompt: userInput,
        aspectRatio: "1:1",
        ...(frameId ? { parentId: frameId } : {}),
      },
      () => {
        sink.canvas({
          op: "add_node",
          node: {
            refId: imgId,
            type: "rect",
            ...(frameId ? { parentId: frameId } : {}),
            x: frameId ? 0 : 80,
            y: frameId ? 0 : 80,
            width: frameId ? 1080 : 900,
            height: frameId ? 680 : 600,
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
        fill: frameId ? "#ffffff" : "#111827",
        x: 80,
        y: 720,
        ...(frameId ? { parentId: frameId } : {}),
      },
      () => {
        sink.canvas({
          op: "add_node",
          node: {
            refId: titleId,
            type: "text",
            ...(frameId ? { parentId: frameId } : {}),
            text: "MOCK DESIGN",
            fontSize: 72,
            fontWeight: "bold",
            fill: frameId ? "#ffffff" : "#111827",
            x: 80,
            y: 720,
            width: 920,
          },
        });
        return { refId: titleId };
      },
      250,
    );

    const summary = `设计完成！\n\n> ⓘ **Mock 模式**：图片以色块占位，关闭 \`MOCK_AGENT\` 可切换真实生成。`;
    sink.emit({ type: "final", text: summary });
  }

  private normalizeToolInput(toolName: string, input: any): any {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return input;
    }

    if (toolName === "plan_ecommerce_suite") {
      input.sourceAssetId ??=
        input.assetId ?? input.sourceAsset ?? input.referenceAssetId;
      input.platforms ??= input.platform;

      if (typeof input.platforms === "string") {
        input.platforms = input.platforms
          .split(/[,/|\s]+/)
          .map((platform: string) => platform.trim())
          .filter(Boolean);
      }
      if (typeof input.sellingPoints === "string") {
        input.sellingPoints = input.sellingPoints
          .split(/[\r\n;；]+/)
          .map((point: string) => point.trim())
          .filter(Boolean);
      }
      if (typeof input.imagesPerPlatform === "string" && /^\d+$/.test(input.imagesPerPlatform.trim())) {
        input.imagesPerPlatform = Number(input.imagesPerPlatform);
      }
    }

    return input;
  }

  private safeParse(value: unknown): any {
    if (!value) return {};
    if (typeof value === "object") return value;
    if (typeof value !== "string") return {};
    try {
      return JSON.parse(value);
    } catch {
      this.logger.warn(`tool args parse failed: ${value.slice(0, 120)}`);
      return {};
    }
  }

  private validateToolInput(toolName: string, input: any): string | null {
    const tool = TOOL_MAP.get(toolName);
    if (!tool) return null;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return "Tool input must be a JSON object";
    }
    const required = tool.parameters.required ?? [];
    for (const key of required) {
      if (input[key] === undefined || input[key] === null) {
        return `Missing required parameter: "${key}"`;
      }
    }
    const props = tool.parameters.properties;
    for (const [key, schema] of Object.entries(props) as [string, any][]) {
      if (input[key] === undefined) continue;
      if (schema.type === "array") {
        const items = Array.isArray(input[key]) ? input[key] : [input[key]];
        if (schema.items?.type === "string") {
          input[key] = items.map((item: unknown) => this.coerceString(item));
        } else {
          input[key] = items;
        }
        if (schema.items?.enum) {
          input[key] = input[key].map((item: unknown) =>
            this.normalizeEnumValue(key, item, schema.items.enum),
          );
          const invalid = input[key].find(
            (item: unknown) => !schema.items.enum.includes(item),
          );
          if (invalid !== undefined) {
            return `Parameter "${key}" items must be one of [${schema.items.enum.join(", ")}], got "${invalid}"`;
          }
        }
        if (schema.uniqueItems) input[key] = [...new Set(input[key])];
        if (schema.minItems && input[key].length < schema.minItems) {
          return `Parameter "${key}" must contain at least ${schema.minItems} item(s)`;
        }
        continue;
      }
      if (
        (schema.type === "number" || schema.type === "integer") &&
        typeof input[key] !== "number"
      ) {
        const num = this.coerceNumber(input[key]);
        if (num === null)
          return `Parameter "${key}" must be a number, got ${typeof input[key]}`;
        input[key] = num;
      }
      if (schema.type === "integer" && !Number.isInteger(input[key])) {
        return `Parameter "${key}" must be an integer`;
      }
      if (typeof input[key] === "number") {
        if (schema.minimum !== undefined && input[key] < schema.minimum) {
          return `Parameter "${key}" must be at least ${schema.minimum}`;
        }
        if (schema.maximum !== undefined && input[key] > schema.maximum) {
          return `Parameter "${key}" must be at most ${schema.maximum}`;
        }
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
    if (key === "platforms") {
      if (["amazon", "亚马逊"].includes(raw) && choices.includes("amazon")) {
        return "amazon";
      }
      if (["taobao", "淘宝", "tmall", "天猫"].includes(raw) && choices.includes("taobao")) {
        return "taobao";
      }
      if (["jd", "jingdong", "京东"].includes(raw) && choices.includes("jd")) {
        return "jd";
      }
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
