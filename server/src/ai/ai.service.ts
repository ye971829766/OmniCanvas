import { Inject, Injectable, Optional, forwardRef, HttpException, HttpStatus } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import type { FilesService } from "../files/files.service";
import { FilesService as FilesServiceValue } from "../files/files.service";
import { ChannelsService, type Channel } from "../channels/channels.service";
import { DatabaseService } from "../database/database.service";
import {
  ModelConfigService,
  type ModelMapping,
} from "../model-config/model-config.service";
import type {
  GenerateImageOutputFormat,
  YunwuImageEndpoint,
  YunwuApiPurpose,
  ChatMessage,
  ChatResponse,
  YunwuModel,
  YunwuModelsResponse,
  ImageModelOptionsResponse,
  GenerateImageResponse,
  VideoModelOptionsResponse,
  GenerateImageJsonRequest,
  GenerateVideoJsonRequest,
} from "../types";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { TokensService } from "../tokens/tokens.service";
import { BillingService } from "../billing/billing.service";
import type { BillingTaskContext } from "../billing/billing.types";

@Injectable()
export class AiService implements OnModuleInit {
  private YUNWU_BASE_URL = (
    process.env.BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.YUNWU_BASE_URL ||
    "https://yunwu.ai/v1"
  ).replace(/\/+$/, "");
  private YUNWU_IMAGE_MODEL = process.env.YUNWU_IMAGE_MODEL || "gpt-image-1";
  private YUNWU_CHAT_MODEL = process.env.YUNWU_CHAT_MODEL || "gpt-4o-mini";
  private MAX_REFERENCE_IMAGES = 16;
  private MAX_VIDEO_REFERENCE_SIZE = (() => {
    const configured = Number(process.env.MAX_VIDEO_REFERENCE_SIZE);
    return Number.isFinite(configured) && configured > 0
      ? Math.floor(configured)
      : 10 * 1024 * 1024;
  })();
  private ALLOWED_OUTPUT_FORMATS = new Set(["png", "jpeg", "webp"]);
  private readonly imageHostUrlCache = new Map<string, string>();

  constructor(
    @Inject(forwardRef(() => FilesServiceValue))
    private readonly filesService: FilesService,
    private readonly channelsService: ChannelsService,
    private readonly modelConfigService: ModelConfigService,
    private readonly dbService: DatabaseService,
    private readonly tokensService: TokensService,
    @Optional() private readonly billingService?: BillingService,
  ) {}

  async onModuleInit() {
    let rows: Array<{ id: string; data: string }>;
    try {
      rows = this.dbService.db.query(`
        SELECT id, data FROM generation_tasks WHERE status = 'generating'
      `).all() as Array<{ id: string; data: string }>;
    } catch (error) {
      console.warn("[AiService] Skipped generation task recovery because the task table is unavailable:", error);
      return;
    }
    for (const row of rows) {
      let state: any;
      try {
        state = JSON.parse(row.data || "{}");
      } catch {
        continue;
      }
      if (state?.kind !== "video") continue;
      if (
        state.phase === "polling" &&
        state.upstreamTaskId &&
        state.providerId &&
        state.originUrl &&
        Number.isFinite(Number(state.deadlineAt))
      ) {
        void this.resumeVideoGenerationTask(row.id, state);
      } else {
        this.setTaskStatus(row.id, "error", {
          error: "服务器重启前视频任务尚未提交完成，预留积分已退回，请重新生成",
        });
      }
    }
  }

  getOutputFormat(format: unknown): GenerateImageOutputFormat {
    const value = typeof format === "string" ? format.toLowerCase() : "";
    return (
      this.ALLOWED_OUTPUT_FORMATS.has(value) ? value : "png"
    ) as GenerateImageOutputFormat;
  }

  buildPrompt(prompt: string, style?: string): string {
    const trimmedPrompt = prompt.trim();
    const trimmedStyle = style?.trim();
    return trimmedStyle
      ? `${trimmedPrompt}\n\nStyle: ${trimmedStyle}`
      : trimmedPrompt;
  }

  getSelectedModel(model: unknown, fallback: string): string {
    return typeof model === "string" && model.trim() ? model.trim() : fallback;
  }

  async prepareImageGenerationRequest(
    body: GenerateImageJsonRequest,
  ): Promise<GenerateImageJsonRequest> {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new HttpException({ error: "Missing prompt" }, HttpStatus.BAD_REQUEST);
    }

    let model = this.getSelectedModel(body?.model, "");
    if (!model) {
      const mappings = await this.modelConfigService.getEnabledMappingsByPurpose("image");
      const activeMapping = mappings.find((mapping) => mapping.enabled);
      model = activeMapping?.id || this.YUNWU_IMAGE_MODEL;
    }

    const options = await this.getImageModelOptions(model);
    const configuredMaxCount = Number(options.maxGenerationCount ?? 1);
    const maxGenerationCount = Number.isSafeInteger(configuredMaxCount) && configuredMaxCount > 0
      ? configuredMaxCount
      : 1;
    const count = body?.n === undefined ? 1 : Number(body.n);
    if (!Number.isSafeInteger(count) || count < 1 || count > maxGenerationCount) {
      throw new HttpException(
        {
          code: "INVALID_IMAGE_COUNT",
          error: `Image count must be an integer between 1 and ${maxGenerationCount} for model ${model}`,
          maxGenerationCount,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const images = Array.isArray(body?.images) ? body.images : undefined;
    const maxReferenceImages = Math.max(0, options.maxReferenceImages ?? 1);
    if (images && images.length > maxReferenceImages) {
      throw new HttpException(
        {
          code: "TOO_MANY_REFERENCE_IMAGES",
          error: `Up to ${maxReferenceImages} reference image(s) allowed for model ${model}`,
          maxReferenceImages,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return { ...body, prompt, model, n: count };
  }

  async prepareVideoGenerationRequest(
    body: GenerateVideoJsonRequest,
  ): Promise<GenerateVideoJsonRequest> {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new HttpException({ error: "Missing prompt" }, HttpStatus.BAD_REQUEST);
    }

    let model = this.getSelectedModel(body?.model, "");
    if (!model) {
      const mappings = await this.modelConfigService.getEnabledMappingsByPurpose("video");
      model = mappings.find((mapping) => mapping.enabled)?.id || "veo_3_1_fast_vip";
    }
    const options = await this.getVideoModelOptions(model);
    const seconds = body?.seconds === undefined
      ? options.defaults.seconds
      : Number(typeof body.seconds === "string" ? body.seconds.trim() : body.seconds);
    if (
      !Number.isSafeInteger(seconds) ||
      seconds < options.minSeconds ||
      seconds > options.maxSeconds
    ) {
      throw new HttpException(
        {
          code: "INVALID_VIDEO_DURATION",
          error: `Video duration must be an integer between ${options.minSeconds} and ${options.maxSeconds} seconds for model ${model}`,
          minSeconds: options.minSeconds,
          maxSeconds: options.maxSeconds,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const allowedSizes = options.sizes.map((option) => option.value);
    const size = typeof body?.size === "string" && body.size.trim()
      ? body.size.trim()
      : options.defaults.size;
    if (allowedSizes.length > 0 && !allowedSizes.includes(size)) {
      throw new HttpException(
        {
          code: "INVALID_VIDEO_SIZE",
          error: `Unsupported video size ${size} for model ${model}`,
          allowedSizes,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const supportReferenceType = options.supportReferenceType || "none";
    const inputReference = this.validateVideoReference(
      body?.input_reference,
      "First-frame reference",
    );
    const inputTailReference = this.validateVideoReference(
      body?.input_tail_reference,
      "Tail-frame reference",
    );
    if (inputReference && supportReferenceType === "none") {
      throw new HttpException(
        { code: "VIDEO_REFERENCE_NOT_SUPPORTED", error: `Model ${model} does not support reference images` },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (inputTailReference && supportReferenceType !== "first_last") {
      throw new HttpException(
        { code: "VIDEO_TAIL_REFERENCE_NOT_SUPPORTED", error: `Model ${model} does not support a tail-frame reference` },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (inputTailReference && !inputReference) {
      throw new HttpException(
        { code: "VIDEO_FIRST_REFERENCE_REQUIRED", error: "A first-frame reference is required when a tail frame is provided" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const watermark = body?.watermark === undefined ? "false" : String(body.watermark).trim().toLowerCase();
    if (watermark !== "true" && watermark !== "false") {
      throw new HttpException(
        { code: "INVALID_VIDEO_WATERMARK", error: "watermark must be true or false" },
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      prompt,
      model,
      seconds: String(seconds),
      size,
      watermark,
      ...(inputReference ? { input_reference: inputReference } : {}),
      ...(inputTailReference ? { input_tail_reference: inputTailReference } : {}),
    };
  }

  private validateVideoReference(value: unknown, label: string): string | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") {
      throw new HttpException({ error: `${label} must be a base64 image data URL` }, HttpStatus.BAD_REQUEST);
    }
    const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match?.[2]) {
      throw new HttpException(
        { error: `${label} must be a PNG, JPEG, or WebP base64 image` },
        HttpStatus.BAD_REQUEST,
      );
    }
    const byteLength = Buffer.from(match[2], "base64").byteLength;
    if (byteLength <= 0 || byteLength > this.MAX_VIDEO_REFERENCE_SIZE) {
      throw new HttpException(
        { error: `${label} must be ${Math.floor(this.MAX_VIDEO_REFERENCE_SIZE / 1024 / 1024)}MB or smaller` },
        HttpStatus.BAD_REQUEST,
      );
    }
    return value;
  }

  private isGptImage2(model: string): boolean {
    return model.trim().toLowerCase().includes("gpt-image-2");
  }

  private resolveImageRequestSize(
    model: string,
    size: unknown,
    options: ImageModelOptionsResponse,
  ): string {
    const requested = typeof size === "string" ? size.trim() : "";
    if (requested) return requested;
    if (this.isGptImage2(model)) return "auto";
    return options.defaults?.size || "1024x1024";
  }

  private resolveImageRequestQuality(model: string, quality: unknown): string {
    const requested = typeof quality === "string" ? quality.trim().toLowerCase() : "";
    if (!this.isGptImage2(model)) return requested;
    if (["auto", "low", "medium", "high"].includes(requested)) return requested;
    if (["hd", "2k", "4k"].includes(requested)) return "high";
    if (["standard", "1k"].includes(requested)) return "medium";
    return "high";
  }

  async resolveModelMapping(
    purpose: YunwuApiPurpose,
    modelId: string,
  ): Promise<ModelMapping | null> {
    const mappings =
      await this.modelConfigService.getEnabledMappingsByPurpose(purpose);
    const normalized = modelId.trim().toLowerCase();
    return (
      mappings.find(
        (item) =>
          item.id.toLowerCase() === normalized ||
          item.label.toLowerCase() === normalized,
      ) || null
    );
  }

  async resolveChannelAndModel(
    purpose: YunwuApiPurpose,
    modelId: string,
  ): Promise<{ channel: Channel | null; upstreamModel: string }> {
    const mapping = await this.resolveModelMapping(purpose, modelId);
    if (mapping) {
      const channels = await this.channelsService.getAll();
      const channel =
        channels.find((item) => item.id === mapping.channelId && item.status) ||
        null;
      return {
        channel,
        upstreamModel: mapping.upstreamModel,
      };
    }

    const channels = await this.channelsService.getActiveChannelsForModel(
      purpose,
      modelId,
    );
    return {
      channel: channels[0] || null,
      upstreamModel: modelId,
    };
  }

  getYunwuApiKey(purpose: YunwuApiPurpose): string | undefined {
    if (purpose === "image") {
      return (
        process.env.IMAGE_API_KEY ||
        process.env.YUNWU_IMAGE_API_KEY ||
        process.env.API_KEY ||
        process.env.YUNWU_API_KEY ||
        process.env.OPENAI_API_KEY
      );
    }
    if (purpose === "video") {
      return (
        process.env.YUNWU_VIDEO_API_KEY ||
        process.env.YUNWU_API_KEY ||
        process.env.IMAGE_API_KEY ||
        process.env.YUNWU_IMAGE_API_KEY ||
        process.env.API_KEY ||
        process.env.OPENAI_API_KEY
      );
    }
    return (
      process.env.CHAT_API_KEY ||
      process.env.YUNWU_CHAT_API_KEY ||
      process.env.API_KEY ||
      process.env.YUNWU_API_KEY ||
      process.env.OPENAI_API_KEY
    );
  }

  parseProviderError(body: any): string | undefined {
    if (!body) return undefined;
    if (typeof body.error === "string") return body.error;
    if (typeof body.error?.message === "string") return body.error.message;
    if (typeof body.message === "string") return body.message;
    return undefined;
  }

  async readJsonSafely(response: Response): Promise<any> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  private isProviderCertificateError(error: unknown): boolean {
    let current: any = error;
    for (let depth = 0; current && depth < 6; depth++) {
      const details = [current?.name, current?.code, current?.message]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (
        details.includes("certificate") ||
        details.includes("cert_") ||
        details.includes("tls") ||
        details.includes("ssl") ||
        details.includes("self-signed") ||
        details.includes("self signed") ||
        details.includes("unable to verify")
      ) {
        return true;
      }
      current = current?.cause ?? current?.error;
    }
    return false;
  }

  /**
   * Retry only certificate-handshake failures. These happen before the request
   * body is accepted, so retrying cannot duplicate a paid generation request.
   */
  async fetchProvider(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const configuredRetries = Number(process.env.PROVIDER_TLS_RETRIES);
    const maxRetries = Number.isFinite(configuredRetries)
      ? Math.min(5, Math.max(0, Math.floor(configuredRetries)))
      : 2;
    const configuredDelay = Number(process.env.PROVIDER_TLS_RETRY_DELAY_MS);
    const baseDelayMs = Number.isFinite(configuredDelay)
      ? Math.min(5_000, Math.max(0, Math.floor(configuredDelay)))
      : 150;

    for (let attempt = 0; ; attempt++) {
      try {
        return await fetch(input, init);
      } catch (error) {
        if (
          !this.isProviderCertificateError(error) ||
          attempt >= maxRetries
        ) {
          throw error;
        }
        const delayMs = Math.min(5_000, baseDelayMs * 2 ** attempt);
        console.warn(
          `[fetchProvider] TLS verification failed for ${input}; ` +
            `retrying ${attempt + 1}/${maxRetries} in ${delayMs}ms`,
        );
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  async callYunwuApi(
    purpose: YunwuApiPurpose,
    path: string,
    body: any,
    headers?: Record<string, string>,
    errorMessage = "Yunwu request failed",
  ) {
    // Determine model for channel matching
    let model: string | undefined;
    if (body instanceof FormData) {
      const formModel = body.get("model");
      if (typeof formModel === "string") model = formModel;
    } else if (
      body &&
      typeof body === "object" &&
      typeof body.model === "string"
    ) {
      model = body.model;
    }

    const route = model
      ? await this.resolveChannelAndModel(purpose, model)
      : { channel: null, upstreamModel: model || "" };
    const channels = route.channel ? [route.channel] : [];

    const errors: string[] = [];

    const attemptCall = async (
      baseUrl: string,
      apiKey: string,
      requestBody: any = body,
    ) => {
      const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
      const init: any = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...headers,
        },
        body:
          requestBody instanceof FormData || typeof requestBody === "string"
            ? requestBody
            : JSON.stringify(requestBody),
        verbose: true,
      };

      const response = await this.fetchProvider(url, init);

      const responseBody = await this.readJsonSafely(response);
      if (!response.ok) {
        throw new Error(
          this.parseProviderError(responseBody) || `HTTP ${response.status}`,
        );
      }
      return responseBody;
    };

    // Try configured channels
    for (const channel of channels) {
      try {
        const payload =
          route.upstreamModel &&
          typeof body === "object" &&
          body &&
          !(body instanceof FormData)
            ? { ...body, model: route.upstreamModel }
            : body instanceof FormData
              ? (() => {
                  const cloned = new FormData();
                  body.forEach((value: any, key: string) => {
                    if (key === "model" && route.upstreamModel) {
                      cloned.append(key, route.upstreamModel);
                    } else {
                      cloned.append(key, value);
                    }
                  });
                  if (route.upstreamModel && !cloned.has("model")) {
                    cloned.append("model", route.upstreamModel);
                  }
                  return cloned;
                })()
              : body;
        const result = await attemptCall(
          channel.baseUrl,
          channel.apiKey,
          payload,
        );
        return result;
      } catch (err: any) {
        console.warn(
          `[callYunwuApi] Channel ${channel.name} failed:`,
          err.message,
        );
        errors.push(`[Channel ${channel.name}]: ${err.message}`);
      }
    }

    if (channels.length === 0) {
      errors.push("未配置该模型的可用渠道");
    }

    throw new HttpException(
      {
        error: errorMessage,
        providerErrors: errors,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }

  async callYunwuImageApi(
    endpoint: YunwuImageEndpoint,
    body: any,
    headers?: Record<string, string>,
  ) {
    return this.callYunwuApi(
      "image",
      `/images/${endpoint}`,
      body,
      headers,
      "Yunwu image generation failed",
    );
  }

  async getYunwuModels(
    purpose: YunwuApiPurpose,
    options: { filterForDisplay?: boolean } = {},
  ): Promise<YunwuModelsResponse> {
    const filterForDisplay = options.filterForDisplay ?? true;
    const videoFallbacks: YunwuModel[] = [
      { id: "veo_3_1_fast_vip", object: "model", ownedBy: "custom" },
      { id: "veo_3_1_vip", object: "model", ownedBy: "custom" },
      { id: "luma-dream-machine", object: "model", ownedBy: "custom" },
      { id: "kling-video", object: "model", ownedBy: "custom" },
      { id: "runway-gen3", object: "model", ownedBy: "custom" },
      { id: "MiniMax-Hailuo-02", object: "model", ownedBy: "custom" },
      { id: "cogvideo", object: "model", ownedBy: "custom" },
    ];

    // Retrieve active channels for this purpose
    const channels = (await this.channelsService.getAll())
      .filter((c) => c.status && (c.type === "all" || c.type === purpose))
      .sort((a, b) => b.weight - a.weight);

    const fetchModels = async (baseUrl: string, key: string) => {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
        verbose: true,
      } as any);
      const responseBody = await this.readJsonSafely(response);
      if (!response.ok) {
        throw new Error(
          this.parseProviderError(responseBody) || `HTTP ${response.status}`,
        );
      }
      return responseBody;
    };

    let responseBody: any = null;
    let success = false;

    // Try channels in order of priority
    for (const channel of channels) {
      try {
        responseBody = await fetchModels(channel.baseUrl, channel.apiKey);
        success = true;
        break;
      } catch (err: any) {
        console.warn(
          `[getYunwuModels] Channel ${channel.name} failed to fetch models:`,
          err.message,
        );
      }
    }

    // Fallback to default credentials from env
    if (!success) {
      const apiKey = this.getYunwuApiKey(purpose);
      if (apiKey) {
        try {
          responseBody = await fetchModels(this.YUNWU_BASE_URL, apiKey);
          success = true;
        } catch (err: any) {
          console.warn(
            `[getYunwuModels] Default env failed to fetch models:`,
            err.message,
          );
        }
      }
    }

    // Fallback to configured mappings if models fail to fetch
    if (!success || !responseBody) {
      const mappings =
        await this.modelConfigService.getEnabledMappingsByPurpose(purpose);
      if (mappings.length > 0) {
        const models = mappings.map((m) => ({
          id: m.id,
          object: "model",
          ownedBy: m.channelId,
        }));
        return {
          type: purpose,
          models,
        };
      }

      if (purpose === "video") {
        const fallbackModels = filterForDisplay
          ? await this.modelConfigService.filterModelsForDisplay(
              purpose,
              videoFallbacks,
            )
          : videoFallbacks;
        return {
          type: "video",
          models: fallbackModels,
        };
      }
      throw new HttpException(
        {
          error:
            "Failed to fetch models from all configured channels and default environment variables, and no local mappings configured.",
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const models: YunwuModel[] = Array.isArray(responseBody?.data)
      ? responseBody.data
          .filter((model: any) => {
            if (typeof model?.id !== "string") return false;
            if (purpose === "video") {
              return (
                model.model_type === "音视频" ||
                (model.tags && model.tags.includes("视频")) ||
                model.id.toLowerCase().includes("veo")
              );
            }
            if (purpose === "image") {
              return (
                model.model_type === "图像" ||
                (model.tags && model.tags.includes("绘画")) ||
                model.id.toLowerCase().includes("image") ||
                model.id.toLowerCase().includes("flux") ||
                model.id.toLowerCase().includes("dall-e")
              );
            }
            if (purpose === "chat") {
              return (
                model.model_type === "文本" ||
                (model.tags && model.tags.includes("对话"))
              );
            }
            return true;
          })
          .map((model: any) => ({
            id: model.id,
            object: typeof model.object === "string" ? model.object : undefined,
            ownedBy:
              typeof model.owned_by === "string" ? model.owned_by : undefined,
          }))
      : [];

    if (purpose === "video" && models.length === 0) {
      const fallbackModels = filterForDisplay
        ? await this.modelConfigService.filterModelsForDisplay(
            purpose,
            videoFallbacks,
          )
        : videoFallbacks;
      return {
        type: "video",
        models: fallbackModels,
      };
    }

    return {
      type: purpose,
      models: filterForDisplay
        ? await this.modelConfigService.filterModelsForDisplay(purpose, models)
        : models,
    };
  }

  createImageModelOptions(
    model: string,
    options: Omit<ImageModelOptionsResponse, "model">,
  ): ImageModelOptionsResponse {
    const normalized = model.toLowerCase();
    let maxReferenceImages = options.maxReferenceImages;

    if (maxReferenceImages === undefined) {
      if (normalized.includes("dall-e-3")) {
        maxReferenceImages = 0;
      } else if (normalized.includes("dall-e-2")) {
        maxReferenceImages = 1;
      } else if (
        normalized.includes("gpt-image-2") ||
        normalized.includes("gpt-image-1") ||
        normalized.includes("gpt-4o")
      ) {
        maxReferenceImages = 8;
      } else if (
        normalized.includes("gemini") ||
        normalized.includes("nano-banana") ||
        normalized.includes("nano-banna")
      ) {
        maxReferenceImages = 14;
      } else if (
        normalized.includes("midjourney") ||
        normalized.startsWith("mj_")
      ) {
        maxReferenceImages = 5;
      } else {
        maxReferenceImages = 1; // Default fallback to 1 reference image
      }
    }

    return {
      model,
      maxReferenceImages,
      ...options,
    };
  }

  async getImageModelOptions(
    model: string,
  ): Promise<ImageModelOptionsResponse> {
    const mapping = await this.resolveModelMapping("image", model);
    const targetModel = mapping ? mapping.upstreamModel : model;
    const result = await this.getImageModelOptionsInternal(
      targetModel,
      mapping,
    );
    result.model = model;
    return result;
  }

  private async getImageModelOptionsInternal(
    model: string,
    mapping: ModelMapping | null,
  ): Promise<ImageModelOptionsResponse> {
    let configSource = mapping;

    if (mapping && mapping.imageConfigId) {
      const allConfig = await this.modelConfigService.getConfig();
      const template = allConfig.imageConfigs?.find(
        (c) => c.id === mapping.imageConfigId,
      );
      if (template) {
        configSource = {
          ...mapping,
          sizes: template.sizes,
          qualities: template.qualities,
          aspectRatios: template.aspectRatios,
          maxReferenceImages: template.maxReferenceImages,
          defaultSize: template.defaultSize,
          defaultQuality: template.defaultQuality,
          qualityMode: template.qualityMode,
          notes: template.notes || mapping.notes,
          maxGenerationCount: template.maxGenerationCount,
        } as any;
      }
    }

    if (
      configSource &&
      (configSource.sizes !== undefined ||
        configSource.qualities !== undefined ||
        configSource.aspectRatios !== undefined ||
        configSource.maxReferenceImages !== undefined ||
        configSource.defaultSize !== undefined ||
        configSource.defaultQuality !== undefined ||
        configSource.qualityMode !== undefined)
    ) {
      return this.createImageModelOptions(model, {
        sizes: configSource.sizes || [],
        qualities: configSource.qualities || ["standard"],
        aspectRatios: configSource.aspectRatios,
        maxReferenceImages: configSource.maxReferenceImages,
        maxGenerationCount: (configSource as any).maxGenerationCount,
        defaults: {
          size:
            configSource.defaultSize ||
            (configSource.sizes && configSource.sizes[0]) ||
            "auto",
          quality:
            configSource.defaultQuality ||
            (configSource.qualities && configSource.qualities[0]) ||
            "standard",
        },
        qualityMode: (configSource.qualityMode as any) || "quality",
        notes: configSource.notes ? [configSource.notes] : undefined,
      });
    }

    const targetModel = mapping ? mapping.upstreamModel : model;
    const normalized = targetModel.toLowerCase();
    const geminiAspectRatios = [
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9",
    ];
    const geminiExtendedAspectRatios = [
      "1:1",
      "1:4",
      "1:8",
      "2:3",
      "3:2",
      "3:4",
      "4:1",
      "4:3",
      "4:5",
      "5:4",
      "8:1",
      "9:16",
      "16:9",
      "21:9",
    ];

    if (normalized.includes("gpt-image-2")) {
      return this.createImageModelOptions(model, {
        sizes: [
          "auto",
          "1024x1024",
          "1536x1024",
          "1024x1536",
          "2048x2048",
          "2048x1152",
          "3840x2160",
          "2160x3840",
        ],
        qualities: ["auto", "low", "medium", "high"],
        defaults: { size: "auto", quality: "high" },
        qualityMode: "quality",
        notes: [
          "Supports flexible custom resolutions when both edges are multiples of 16, the longest edge is <= 3840px, aspect ratio is <= 3:1, and total pixels are within provider limits.",
        ],
        source: "OpenAI GPT Image 2 image generation guide",
        sourceUrls: [
          "https://platform.openai.com/docs/guides/image-generation",
        ],
      });
    }

    if (
      normalized.includes("gpt-image-1.5") ||
      normalized.includes("gpt-image-1-mini") ||
      normalized.includes("gpt-image-1")
    ) {
      return this.createImageModelOptions(model, {
        sizes: ["1024x1024", "1024x1536", "1536x1024", "auto"],
        qualities: ["auto", "low", "medium", "high"],
        defaults: { size: "1024x1024", quality: "auto" },
        qualityMode: "quality",
        source: "OpenAI GPT Image model guide",
        sourceUrls: [
          "https://platform.openai.com/docs/guides/image-generation",
        ],
      });
    }

    if (normalized.includes("dall-e-2")) {
      return this.createImageModelOptions(model, {
        sizes: ["256x256", "512x512", "1024x1024"],
        qualities: ["standard"],
        defaults: { size: "1024x1024", quality: "standard" },
        qualityMode: "quality",
        source: "OpenAI DALL-E 2 compatibility preset",
        sourceUrls: [
          "https://platform.openai.com/docs/guides/image-generation",
        ],
      });
    }

    if (normalized.includes("dall-e-3")) {
      return this.createImageModelOptions(model, {
        sizes: ["1024x1024", "1024x1792", "1792x1024"],
        qualities: ["standard", "hd"],
        defaults: { size: "1024x1024", quality: "standard" },
        qualityMode: "quality",
        source: "OpenAI DALL-E 3 compatibility preset",
        sourceUrls: [
          "https://platform.openai.com/docs/guides/image-generation",
        ],
      });
    }

    if (
      normalized.includes("nano-banana-pro") ||
      normalized.includes("gemini-3-pro-image")
    ) {
      return this.createImageModelOptions(model, {
        sizes: [
          "1024x1024",
          "2048x2048",
          "4096x4096",
          "1376x768",
          "2752x1536",
          "5504x3072",
          "768x1376",
          "1536x2752",
          "3072x5504",
          "1584x672",
          "3168x1344",
          "6336x2688",
        ],
        qualities: ["1K", "2K", "4K"],
        defaults: { size: "2048x2048", quality: "2K" },
        aspectRatios: geminiAspectRatios,
        qualityMode: "image_size",
        notes: [
          "Native Gemini uses aspect_ratio plus image_size rather than OpenAI size/quality; Yunwu compatibility may translate these differently.",
          "4K output is marked preview in Google Cloud documentation.",
        ],
        source: "Google Gemini 3 Pro Image / Nano Banana Pro docs",
        sourceUrls: ["https://ai.google.dev/gemini-api/docs/image-generation"],
      });
    }

    if (
      normalized.includes("nano-banana-2") ||
      normalized.includes("gemini-3.1-flash-image")
    ) {
      return this.createImageModelOptions(model, {
        sizes: [],
        qualities: ["512", "1K", "2K", "4K"],
        defaults: { size: "2048x2048", quality: "2K" },
        aspectRatios: geminiExtendedAspectRatios,
        qualityMode: "image_size",
        notes: [
          "Supports up to 4K high-resolution outputs with customizable thinking levels.",
        ],
        source: "Google Gemini 3.1 Flash Image / Nano Banana 2 docs",
        sourceUrls: ["https://ai.google.dev/gemini-api/docs/image-generation"],
      });
    }

    if (
      normalized.includes("nano-banana") ||
      normalized.includes("gemini-2.5-flash-image")
    ) {
      return this.createImageModelOptions(model, {
        sizes: [
          "1024x1024",
          "1344x768",
          "768x1344",
          "1248x832",
          "832x1248",
          "1184x864",
          "864x1184",
          "1536x672",
        ],
        qualities: ["1K"],
        defaults: { size: "1024x1024", quality: "1K" },
        aspectRatios: geminiAspectRatios,
        qualityMode: "image_size",
        notes: [
          "Gemini 2.5 Flash Image is documented as a 1024px-class output model.",
        ],
        source: "Google Gemini 2.5 Flash Image / Nano Banana docs",
        sourceUrls: ["https://ai.google.dev/gemini-api/docs/image-generation"],
      });
    }

    if (normalized.includes("qwen-image-2.0")) {
      return this.createImageModelOptions(model, {
        sizes: [
          "2048x2048",
          "2688x1536",
          "1536x2688",
          "2368x1728",
          "1728x2368",
        ],
        qualities: ["standard"],
        defaults: { size: "2048x2048", quality: "standard" },
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        qualityMode: "preset",
        notes: [
          "Alibaba documents Qwen size as width*height; Yunwu/OpenAI-compatible requests use widthxheight here.",
        ],
        source: "Alibaba Cloud Qwen-Image API reference",
        sourceUrls: ["https://help.aliyun.com/zh/model-studio/qwen-image-api"],
      });
    }

    if (
      normalized.includes("qwen-image-2512") ||
      normalized.includes("qwen-image-25") ||
      normalized.includes("qwen-image-edit")
    ) {
      return this.createImageModelOptions(model, {
        sizes: [
          "1328x1328",
          "1664x928",
          "928x1664",
          "1472x1104",
          "1104x1472",
          "1584x1056",
          "1056x1584",
        ],
        qualities: ["standard"],
        defaults: { size: "1328x1328", quality: "standard" },
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
        qualityMode: "preset",
        notes: [
          "Qwen-Image 25xx community and official-adjacent workflow docs commonly expose trained aspect-ratio presets rather than OpenAI quality values.",
        ],
        source: "Qwen-Image 25xx compatibility preset",
        sourceUrls: [
          "https://docs.comfy.org/tutorials/image/qwen/qwen-image-2512",
        ],
      });
    }

    if (
      normalized.includes("qwen-image-max") ||
      normalized.includes("qwen-image-plus") ||
      normalized === "qwen-image"
    ) {
      return this.createImageModelOptions(model, {
        sizes: ["1664x928", "1472x1104", "1328x1328", "1104x1472", "928x1664"],
        qualities: ["standard"],
        defaults: { size: "1664x928", quality: "standard" },
        aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16"],
        qualityMode: "preset",
        notes: [
          "Alibaba documents Qwen size as width*height; Yunwu/OpenAI-compatible requests use widthxheight here.",
        ],
        source: "Alibaba Cloud Qwen-Image API reference",
        sourceUrls: ["https://help.aliyun.com/zh/model-studio/qwen-image-api"],
      });
    }

    if (
      normalized.includes("seedream") ||
      normalized.includes("doubao-seedream")
    ) {
      return this.createImageModelOptions(model, {
        sizes: [
          "1024x1024",
          "2048x2048",
          "4096x4096",
          "2048x1152",
          "1152x2048",
          "3840x2160",
          "2160x3840",
        ],
        qualities: ["standard", "2K", "4K"],
        defaults: { size: "2048x2048", quality: "2K" },
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        qualityMode: "resolution",
        notes: [
          "Seedream 4.x is documented as supporting high-definition output up to 4K; Yunwu model descriptions also mention 4K for Seedream 4.0.",
        ],
        source: "ByteDance Seedream 4.x public docs and Yunwu model metadata",
        sourceUrls: ["https://seed.bytedance.com/en/seedream4_0"],
      });
    }

    if (normalized.includes("flux-2") || normalized.includes("flux.2")) {
      return this.createImageModelOptions(model, {
        sizes: [
          "1024x1024",
          "1536x1024",
          "1024x1536",
          "2048x2048",
          "2560x1440",
          "1440x2560",
        ],
        qualities: ["standard"],
        defaults: { size: "1024x1024", quality: "standard" },
        aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"],
        qualityMode: "preset",
        notes: [
          "Native FLUX.2 exposes flexible aspect ratios and model-specific controls; OpenAI-compatible gateways usually translate this to size presets.",
          "FLUX.2 editing docs mention up to 4MP output.",
        ],
        source: "Black Forest Labs FLUX.2 documentation",
        sourceUrls: [
          "https://docs.bfl.ai/flux_2/flux2_text_to_image",
          "https://docs.bfl.ai/flux_2/flux2_image_editing",
        ],
      });
    }

    if (normalized.includes("flux")) {
      return this.createImageModelOptions(model, {
        sizes: [
          "512x512",
          "768x768",
          "1024x1024",
          "1024x768",
          "768x1024",
          "1440x1440",
        ],
        qualities: ["standard"],
        defaults: { size: "1024x1024", quality: "standard" },
        aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
        qualityMode: "preset",
        notes: [
          "Native FLUX APIs commonly expose width/height or aspect_ratio rather than OpenAI quality presets.",
        ],
        source: "Black Forest Labs FLUX documentation",
        sourceUrls: ["https://docs.bfl.ai/flux_models/flux_1_1_pro"],
      });
    }

    if (
      normalized.includes("grok") ||
      normalized.includes("xai") ||
      normalized.includes("grok-imagine")
    ) {
      return this.createImageModelOptions(model, {
        sizes: [
          "1024x1024",
          "2048x2048",
          "1344x768",
          "768x1344",
          "1536x768",
          "768x1536",
          "auto",
        ],
        qualities: ["1k", "2k"],
        defaults: { size: "auto", quality: "1k" },
        aspectRatios: [
          "auto",
          "1:1",
          "16:9",
          "9:16",
          "4:3",
          "3:4",
          "3:2",
          "2:3",
          "2:1",
          "1:2",
          "19.5:9",
          "9:19.5",
          "20:9",
          "9:20",
        ],
        qualityMode: "resolution",
        notes: [
          "Native xAI image API uses aspect_ratio and resolution fields; Yunwu compatibility may translate size/quality differently.",
        ],
        source: "xAI Grok Imagine image generation docs",
        sourceUrls: ["https://docs.x.ai/docs/guides/image-generations"],
      });
    }

    if (normalized.includes("midjourney") || normalized.startsWith("mj_")) {
      return this.createImageModelOptions(model, {
        sizes: ["2048x2048", "2048x1152", "1152x2048"],
        qualities: ["standard", "upscaled"],
        defaults: { size: "2048x2048", quality: "standard" },
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
        qualityMode: "preset",
        notes: [
          "Midjourney commonly controls composition through aspect ratio and upscaling rather than OpenAI quality values.",
        ],
        source: "Midjourney size and resolution docs",
      });
    }

    if (normalized.includes("kling")) {
      return this.createImageModelOptions(model, {
        sizes: ["1024x1024", "1536x1024", "1024x1536", "2048x2048"],
        qualities: ["standard", "hd"],
        defaults: { size: "1024x1024", quality: "standard" },
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        qualityMode: "preset",
        notes: [
          "Kling image models are often asynchronous; verify Yunwu parameter compatibility for specific Kling model variants.",
        ],
        source: "Yunwu model metadata and compatibility preset",
      });
    }

    if (normalized.includes("gpt-4o")) {
      return this.createImageModelOptions(model, {
        sizes: ["1024x1024", "1024x1536", "1536x1024", "auto"],
        qualities: ["auto", "low", "medium", "high"],
        defaults: { size: "1024x1024", quality: "auto" },
        qualityMode: "quality",
        source: "OpenAI-compatible GPT image preset",
        sourceUrls: [
          "https://platform.openai.com/docs/guides/image-generation",
        ],
      });
    }

    return this.createImageModelOptions(model, {
      sizes: ["1024x1024", "1024x1536", "1536x1024", "auto"],
      qualities: ["auto", "standard", "hd", "low", "medium", "high"],
      defaults: { size: "1024x1024", quality: "auto" },
      qualityMode: "quality",
      notes: [
        "Unknown image model; using broad OpenAI-compatible defaults. Verify against Yunwu/provider docs before exposing advanced options.",
      ],
      source: "fallback",
    });
  }

  isChatMessage(value: any): value is ChatMessage {
    return (
      value &&
      (value.role === "system" ||
        value.role === "user" ||
        value.role === "assistant") &&
      (typeof value.content === "string" || Array.isArray(value.content))
    );
  }

  async chatWithYunwu(
    body: any,
    user?: { userId?: string; username?: string },
  ): Promise<ChatResponse> {
    const messages = Array.isArray(body?.messages)
      ? body.messages.filter((m: any) => this.isChatMessage(m))
      : [];
    if (messages.length === 0) {
      throw new HttpException(
        { error: "Missing chat messages" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const model = this.getSelectedModel(body?.model, this.YUNWU_CHAT_MODEL);
    const payload: Record<string, unknown> = {
      model,
      messages,
    };

    if (typeof body?.temperature === "number") {
      payload.temperature = body.temperature;
    }
    if (typeof body?.maxTokens === "number") {
      payload.max_tokens = body.maxTokens;
    }
    if (body?.response_format !== undefined) {
      payload.response_format = body.response_format;
    } else if (body?.responseFormat !== undefined) {
      payload.response_format = body.responseFormat;
    }

    const providerResponseBody = await this.callYunwuApi(
      "chat",
      "/chat/completions",
      payload,
      { "content-type": "application/json" },
      "Yunwu chat completion failed",
    );

    const message = providerResponseBody?.choices?.[0]?.message ?? null;
    const usage = providerResponseBody?.usage;

    if (usage) {
      this.tokensService.recordTokenUsage({
        userId: user?.userId,
        username: user?.username,
        model: typeof providerResponseBody?.model === "string" ? providerResponseBody.model : model,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        type: "chat",
      });
    }

    return {
      type: "chat",
      model:
        typeof providerResponseBody?.model === "string"
          ? providerResponseBody.model
          : model,
      message: this.isChatMessage(message) ? message : null,
      choices: Array.isArray(providerResponseBody?.choices)
        ? providerResponseBody.choices
        : [],
      usage: providerResponseBody?.usage,
    };
  }

  getTaskStatus(id: string, userId?: string) {
    try {
      const stmt = this.dbService.db.prepare(
        userId
          ? "SELECT * FROM generation_tasks WHERE id = $id AND userId = $userId"
          : "SELECT * FROM generation_tasks WHERE id = $id",
      );
      const row = stmt.get(userId ? { $id: id, $userId: userId } : { $id: id }) as any;
      if (!row) {
        throw new HttpException(
          { error: "Task not found" },
          HttpStatus.NOT_FOUND,
        );
      }
      const data = JSON.parse(row.data);
      return {
        id: row.id,
        status: row.status,
        ...data,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { error: "Internal database error" },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private setTaskStatus(
    id: string,
    status: string,
    data: any,
    finalBillingMicros?: number,
  ) {
    try {
      const stmt = this.dbService.db.prepare(`
        INSERT INTO generation_tasks (id, status, data, createdAt, updatedAt)
        VALUES ($id, $status, $data, $createdAt, $updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          data = excluded.data,
          updatedAt = excluded.updatedAt
      `);
      stmt.run({
        $id: id,
        $status: status,
        $data: JSON.stringify(data),
        $createdAt: Date.now(),
        $updatedAt: Date.now(),
      });
    } catch (err) {
      console.error(`Failed to save task status for ${id}:`, err);
      return;
    }
    try {
      this.billingService?.settleTask(id, status, data?.error, finalBillingMicros);
    } catch (err) {
      console.error(`Failed to settle billing for task ${id}:`, err);
    }
  }

  private handleBackgroundTaskRejection(
    taskId: string,
    taskType: "image" | "video",
    error: unknown,
  ): void {
    const message =
      error instanceof Error ? error.message : String(error || "Generation failed");
    console.error(
      `[${taskType}GenerationTask] Task ${taskId} rejected before reaching its internal error handler:`,
      error,
    );
    this.setTaskStatus(taskId, "error", { error: message });
  }

  async runGenerationTaskInBackground(
    taskId: string,
    body: GenerateImageJsonRequest,
    originUrl: string,
    billingContext?: BillingTaskContext,
  ) {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const outputFormat = this.getOutputFormat(body?.outputFormat);

    if (
      process.env.MOCK_IMAGE_GENERATION === "true" ||
      process.env.MOCK_AGENT === "true"
    ) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const imageUrl = `http://101.200.138.2:8093/i/49496bbf-85cc-4f9b-a275-5736cb2497f8.png`;
        const requestedCount = body.n || 1;
        const images = Array.from({ length: requestedCount }, (_, index) => ({
          imageUrl,
          url: imageUrl,
          index,
        }));
        const finalBillingMicros = billingContext && this.billingService
          ? this.billingService.quoteForOperation(billingContext.operationId, {
              ...body,
              n: images.length,
            }).amountMicros
          : undefined;

        this.setTaskStatus(taskId, "success", {
          imageUrl,
          url: imageUrl,
          images,
          requestedCount,
          successfulCount: images.length,
          failedCount: 0,
          partial: false,
        }, finalBillingMicros);
        return;
      } catch (err: any) {
        this.setTaskStatus(taskId, "error", {
          error: err.message || "Mock generation failed",
        });
        return;
      }
    }

    let model = this.getSelectedModel(body?.model, "");
    if (!model) {
      const mappings =
        await this.modelConfigService.getEnabledMappingsByPurpose("image");
      const activeMapping = mappings.find((m) => m.enabled);
      model = activeMapping ? activeMapping.id : this.YUNWU_IMAGE_MODEL;
    }
    const options = await this.getImageModelOptions(model);
    const maxAllowed = options.maxReferenceImages ?? 1;

    if (Array.isArray(body?.images) && body.images.length > maxAllowed) {
      throw new Error(
        `Up to ${maxAllowed} reference image(s) allowed for model ${model}`,
      );
    }

    try {
      const requestedCount = body.n || 1;
      const filenames: string[] = [];
      const saveErrors: string[] = [];

      const route = await this.resolveChannelAndModel("image", model);
      const upstreamModel = route.upstreamModel;
      const requestSize = this.resolveImageRequestSize(
        upstreamModel || model,
        body?.size,
        options,
      );
      const requestQuality = this.resolveImageRequestQuality(
        upstreamModel || model,
        body?.quality,
      );
      const isGptImage2 = this.isGptImage2(upstreamModel || model);

      const useNativeGemini =
        (model.toLowerCase().includes("gemini") ||
          model.toLowerCase().includes("nano-banana") ||
          model.toLowerCase().includes("nano-banna") ||
          upstreamModel.toLowerCase().includes("gemini") ||
          upstreamModel.toLowerCase().includes("nano-banana") ||
          upstreamModel.toLowerCase().includes("nano-banna") ||
          upstreamModel.toLowerCase().includes("imagen")) &&
        process.env.GEMINI_API_FORMAT !== "openai";

      if (useNativeGemini) {
        const channel = route.channel;
        if (!channel) {
          throw new Error("未配置该模型的可用渠道");
        }
        const apiKey = channel.apiKey;
        const baseUrl = channel.baseUrl;
        // Google GenAI SDK expects a host root (e.g. https://yunwu.ai/v1beta),
        // not the full :generateContent endpoint URL.
        const nativeBaseUrl = baseUrl
          .replace(/\/+$/, "")
          .replace(/\/v1$/i, "")
          .replace(/\/v1beta$/i, "");
        const googleClient = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            baseUrl: `${nativeBaseUrl}/v1beta`,
          },
        });

        const contentsParts: any[] = [{ text: prompt }];

        // Support reference images (Image-to-Image / Multi-modal).
        // @google/genai expects camelCase `inlineData.mimeType` — snake_case
        // `inline_data` is ignored and yields:
        //   required oneof field 'data' must have one initialized field
        if (Array.isArray(body?.images) && body.images.length > 0) {
          let accepted = 0;
          for (const imgBase64 of body.images) {
            if (typeof imgBase64 !== "string" || !imgBase64.trim()) continue;
            const matches = imgBase64
              .replace(/\s+/g, "")
              .match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
            if (matches?.[1] && matches[2]) {
              contentsParts.push({
                inlineData: {
                  mimeType: matches[1],
                  data: matches[2],
                },
              });
              accepted += 1;
            }
          }
          if (accepted === 0) {
            throw new Error(
              "参考图数据无效：未能解析为 data:image/*;base64,... 格式，请重新上传素材后重试",
            );
          }
        }

        // Resolve a valid imageSize (quality) for native Gemini
        let quality = "1K";
        let defaultSize = "1K";
        if (
          upstreamModel.toLowerCase().includes("3.1") ||
          upstreamModel.toLowerCase().includes("banana-2")
        ) {
          defaultSize = "2K";
        }
        quality = defaultSize;

        const sizeCandidates = [body?.size, body?.quality];
        for (const candidate of sizeCandidates) {
          if (typeof candidate === "string" && candidate.trim()) {
            const val = candidate.trim().toUpperCase();
            if (val === "512" || val === "1K" || val === "2K" || val === "4K") {
              quality = val;
              break;
            }
          }
        }

        // Resolve a valid aspectRatio for native Gemini
        let aspectRatio = "1:1";
        if (typeof body?.aspectRatio === "string" && body.aspectRatio.trim()) {
          const val = body.aspectRatio.trim();
          const validRatios = new Set([
            "1:1",
            "1:4",
            "1:8",
            "2:3",
            "3:2",
            "3:4",
            "4:1",
            "4:3",
            "4:5",
            "5:4",
            "8:1",
            "9:16",
            "16:9",
            "21:9",
          ]);
          if (validRatios.has(val)) {
            aspectRatio = val;
          }
        }

        const payload = {
          contents: [
            {
              role: "user",
              parts: contentsParts,
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio,
              imageSize: quality,
            },
          },
        };

        const nativeResults = await Promise.allSettled(
          Array.from({ length: requestedCount }, () =>
            googleClient.models.generateContent({
              model: upstreamModel,
              contents: payload.contents,
              config: payload.generationConfig,
            }),
          ),
        );

        // const response = await fetch(url, {
        //   method: "POST",
        //   headers: {
        //     "Content-Type": "application/json",
        //     Authorization: `Bearer ${apiKey}`,
        //   },
        //   body: JSON.stringify(payload),
        //   verbose: true,
        // } as any);

        // const responseBody = await this.readJsonSafely(response);
        // if (!response.ok) {
        //   throw new Error(
        //     this.parseProviderError(responseBody) ||
        //       "Yunwu image generation failed",
        //   );
        // }

        for (const result of nativeResults) {
          if (result.status === "rejected") {
            saveErrors.push(result.reason?.message || String(result.reason || "Gemini generation failed"));
            continue;
          }
          const saved = await this.filesService.saveGeneratedImages(
            result.value,
            outputFormat,
          );
          filenames.push(...saved.filenames);
          saveErrors.push(...saved.errors);
        }
      } else {
        // If base64 reference images are provided for image-to-image / edits
        const channel = route.channel;
        if (Array.isArray(body?.images) && body.images.length > 0) {
          // Checked against model options at function entry

          const upstreamForm = new FormData();
          upstreamForm.append("model", model);
          upstreamForm.append(
            "prompt",
            this.buildPrompt(
              prompt,
              typeof body?.style === "string" ? body.style : undefined,
            ),
          );
          upstreamForm.append(
            "size",
            requestSize,
          );
          upstreamForm.append("output_format", outputFormat);
          upstreamForm.append("n", String(requestedCount));

          if (requestQuality) {
            upstreamForm.append("quality", requestQuality);
            if (!isGptImage2) {
              upstreamForm.append("image_size", requestQuality);
              upstreamForm.append("imageSize", requestQuality);
            }
          }

          const aspectRatio =
            typeof body?.aspectRatio === "string"
              ? body.aspectRatio.trim()
              : "";
          if (aspectRatio && !isGptImage2) {
            upstreamForm.append("aspectRatio", aspectRatio);
            upstreamForm.append("aspect_ratio", aspectRatio);
          }

          // Helper to validate and convert base64 image data url to Web File
          const processBase64Image = (
            base64Str: string,
            index: number,
            isMask = false,
          ): File => {
            const matches = base64Str.match(/^data:(image\/\w+);base64,(.+)$/);
            if (!matches || !matches[2]) {
              throw new Error(
                `${isMask ? "Mask" : `Image ${index + 1}`} is not a valid base64 image data URL`,
              );
            }
            const mimeType = matches[1]!;
            const base64Data = matches[2]!;
            const buffer = Buffer.from(base64Data, "base64");

            const allowedMime = new Set([
              "image/png",
              "image/jpeg",
              "image/webp",
            ]);
            if (isMask) {
              if (mimeType !== "image/png") {
                throw new Error("Mask must be a PNG image");
              }
            } else {
              if (!allowedMime.has(mimeType)) {
                throw new Error(
                  `Image ${index + 1} must be PNG, JPEG, or WebP`,
                );
              }
            }

            if (buffer.length > 50 * 1024 * 1024) {
              throw new Error(
                `${isMask ? "Mask" : `Image ${index + 1}`} must be 50MB or smaller`,
              );
            }

            const extension = mimeType.split("/")[1] || "png";
            const filename = `${isMask ? "mask" : `image-${index}`}.${extension}`;
            return new File([buffer], filename, { type: mimeType });
          };

          body.images.forEach((imgBase64: any, index: number) => {
            if (typeof imgBase64 !== "string") {
              throw new Error(`Image ${index + 1} must be a base64 string`);
            }
            const file = processBase64Image(imgBase64, index, false);
            upstreamForm.append("image", file as any, file.name);
          });

          if (body.mask) {
            if (typeof body.mask !== "string") {
              throw new Error("Mask must be a base64 string");
            }
            const maskFile = processBase64Image(body.mask, 0, true);
            upstreamForm.append("mask", maskFile as any, maskFile.name);
          }

          const providerBody = await this.callYunwuImageApi(
            "edits",
            upstreamForm,
          );

          const saved = await this.filesService.saveGeneratedImages(
            providerBody,
            outputFormat,
          );
          filenames.push(...saved.filenames);
          saveErrors.push(...saved.errors);
        } else {
          // Otherwise, standard Text-to-Image (Generations)
          if (!channel) {
            throw new Error("未配置该模型的可用渠道");
          }

          const openAi = new OpenAI({
            apiKey: channel.apiKey,
            baseURL: channel.baseUrl,
          });

          const generateParams: Record<string, any> = {
            model: upstreamModel,
            prompt: this.buildPrompt(
              prompt,
              typeof body?.style === "string" ? body.style : undefined,
            ),
            size: requestSize,
            n: requestedCount,
          };

          if (requestQuality) {
            generateParams.quality = requestQuality;
          }

          const sdkResponse = await openAi.images.generate(
            generateParams as any,
          );
          const providerBody = JSON.parse(JSON.stringify(sdkResponse));

          const saved = await this.filesService.saveGeneratedImages(
            providerBody,
            outputFormat,
          );
          filenames.push(...saved.filenames);
          saveErrors.push(...saved.errors);
        }
      }

      const successfulFilenames = filenames.slice(0, requestedCount);
      if (successfulFilenames.length === 0) {
        throw new Error(saveErrors[0] || "Provider response did not include an image");
      }
      const images = successfulFilenames.map((filename, index) => {
        const imageUrl = `${originUrl}/files/${filename}`;
        return { imageUrl, url: imageUrl, index };
      });
      const successfulCount = images.length;
      const failedCount = Math.max(0, requestedCount - successfulCount);
      const firstImageUrl = images[0]!.imageUrl;
      const finalBillingMicros = billingContext && this.billingService
        ? this.billingService.quoteForOperation(billingContext.operationId, {
            ...body,
            n: successfulCount,
          }).amountMicros
        : undefined;

      this.setTaskStatus(taskId, "success", {
        imageUrl: firstImageUrl,
        url: firstImageUrl,
        images,
        requestedCount,
        successfulCount,
        failedCount,
        partial: failedCount > 0,
        warnings: saveErrors.length > 0 ? saveErrors : undefined,
      }, finalBillingMicros);
    } catch (err: any) {
      console.error(
        `[runGenerationTaskInBackground] Task ${taskId} failed:`,
        err,
      );
      let errMsg = err.message || "生成失败，请重试";
      if (err instanceof HttpException) {
        const resp: any = err.getResponse();
        if (resp && typeof resp === "object") {
          if (
            Array.isArray(resp.providerErrors) &&
            resp.providerErrors.length > 0
          ) {
            errMsg = resp.providerErrors.join("; ");
          } else if (resp.error) {
            errMsg = resp.error;
          }
        }
      }
      this.setTaskStatus(taskId, "error", {
        error: errMsg,
      });
    }
  }

  async generateImageFromJson(
    body: GenerateImageJsonRequest,
    originUrl: string,
    billingContext?: BillingTaskContext,
  ): Promise<GenerateImageResponse> {
    const preparedBody = await this.prepareImageGenerationRequest(body);

    const taskId = crypto.randomUUID();
    this.setTaskStatus(taskId, "generating", {});
    if (billingContext) {
      if (!this.billingService) throw new Error("Billing service is unavailable");
      this.billingService.attachTask(
        billingContext.operationId,
        taskId,
        billingContext.userId,
      );
    }

    void this.runGenerationTaskInBackground(
      taskId,
      preparedBody,
      originUrl,
      billingContext,
    ).catch(
      (error) => this.handleBackgroundTaskRejection(taskId, "image", error),
    );

    return {
      type: "image",
      taskId,
      status: "generating",
      requestedCount: preparedBody.n,
    };
  }

  private getVideoGenerationTimeoutMs(): number {
    const configured = Number(process.env.VIDEO_GENERATION_TIMEOUT_MS);
    return Number.isFinite(configured) && configured >= 30_000
      ? Math.floor(configured)
      : 5 * 60 * 1000;
  }

  private buildVideoProviderForm(body: GenerateVideoJsonRequest, upstreamModel: string): FormData {
    const form = new FormData();
    form.append("model", upstreamModel);
    form.append("prompt", body.prompt!);
    form.append("seconds", body.seconds!);
    form.append("size", body.size!);
    form.append("watermark", body.watermark || "false");
    const appendReference = (field: string, value: string | undefined) => {
      if (!value) return;
      const match = value.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
      if (!match?.[1] || !match[2]) return;
      const extension = match[1].toLowerCase() === "image/jpeg" ? "jpg" : match[1].split("/")[1];
      const file = new File(
        [Buffer.from(match[2], "base64")],
        `${field}.${extension}`,
        { type: match[1] },
      );
      form.append(field, file as any, file.name);
    };
    appendReference("input_reference", body.input_reference);
    appendReference("input_tail_reference", body.input_tail_reference);
    return form;
  }

  private async getVideoProviderCredentials(providerId: string, fallbackBaseUrl?: string) {
    if (providerId === "__env__") {
      const apiKey = this.getYunwuApiKey("video");
      return apiKey ? { baseUrl: fallbackBaseUrl || this.YUNWU_BASE_URL, apiKey } : null;
    }
    const channels = await this.channelsService.getAll();
    const channel = channels.find((item) => item.id === providerId);
    return channel ? { baseUrl: channel.baseUrl, apiKey: channel.apiKey } : null;
  }

  private async resumeVideoGenerationTask(taskId: string, state: any) {
    try {
      await this.pollVideoProviderTask(taskId, state);
    } catch (error: any) {
      console.error(`[resumeVideoGenerationTask] Task ${taskId} failed:`, error);
      this.setTaskStatus(taskId, "error", {
        error: error?.message || "恢复视频生成任务失败，预留积分已退回",
      });
    }
  }

  private async pollVideoProviderTask(
    taskId: string,
    state: {
      upstreamTaskId: string;
      providerId: string;
      providerBaseUrl?: string;
      originUrl: string;
      deadlineAt: number;
    },
  ) {
    const credentials = await this.getVideoProviderCredentials(
      state.providerId,
      state.providerBaseUrl,
    );
    if (!credentials) throw new Error("视频渠道已被删除或密钥不可用");

    while (Date.now() < Number(state.deadlineAt)) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      let statusRes: Response;
      try {
        statusRes = await this.fetchProvider(
          `${credentials.baseUrl.replace(/\/+$/, "")}/videos/${encodeURIComponent(state.upstreamTaskId)}`,
          {
            headers: { Authorization: `Bearer ${credentials.apiKey}` },
            signal: AbortSignal.timeout(20_000),
          },
        );
      } catch (error: any) {
        console.warn(`[VideoTaskPolling] Temporary polling error for ${state.upstreamTaskId}:`, error?.message);
        continue;
      }

      const statusData = await this.readJsonSafely(statusRes);
      if (!statusRes.ok) {
        if ([400, 401, 403, 404].includes(statusRes.status)) {
          throw new Error(this.parseProviderError(statusData) || `Video status HTTP ${statusRes.status}`);
        }
        console.warn(`[VideoTaskPolling] Temporary HTTP ${statusRes.status}:`, statusData);
        continue;
      }

      const status = String(statusData?.status || "").toLowerCase();
      if (status === "succeeded" || status === "success" || status === "completed") {
        const videoUrl =
          statusData?.video_url ||
          statusData?.videoUrl ||
          statusData?.output?.video_url ||
          statusData?.data?.video_url;
        if (!videoUrl) throw new Error("Succeeded status but no video URL returned");
        const localResult = await this.filesService.downloadAndSaveVideo(videoUrl, state.originUrl);
        this.setTaskStatus(taskId, "success", {
          videoUrl: localResult.videoUrl,
          thumbnailUrl: localResult.thumbnailUrl,
        });
        return;
      }
      if (["failed", "error", "cancelled", "canceled"].includes(status)) {
        throw new Error(this.parseProviderError(statusData) || "Video generation failed upstream");
      }
    }
    throw new Error("Video generation timed out");
  }

  async runVideoGenerationTaskInBackground(
    taskId: string,
    body: GenerateVideoJsonRequest,
    originUrl: string,
  ) {
    try {
      const model = body.model!;
      const route = await this.resolveChannelAndModel("video", model);
      const upstreamModel = route.upstreamModel;

      if (process.env.MOCK_VIDEO === "true" || process.env.MOCK_AGENT === "true") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const localResult = await this.filesService.generateMockVideo(originUrl);
        this.setTaskStatus(taskId, "success", localResult);
        return;
      }

      const discoveredChannels = await this.channelsService.getActiveChannelsForModel(
        "video",
        upstreamModel,
      );
      const candidates = [route.channel, ...discoveredChannels]
        .filter(Boolean)
        .filter((channel: any, index, all) => all.findIndex((item: any) => item?.id === channel.id) === index) as Channel[];
      const environmentApiKey = this.getYunwuApiKey("video");
      if (candidates.length === 0 && environmentApiKey) {
        candidates.push({
          id: "__env__",
          name: "Environment video provider",
          baseUrl: this.YUNWU_BASE_URL,
          apiKey: environmentApiKey,
          type: "video",
          models: [upstreamModel],
          weight: 0,
          status: true,
          createdAt: "",
        });
      }
      if (candidates.length === 0) throw new Error("未配置该模型的可用视频渠道");

      let responseBody: any;
      let chosenChannel: Channel | undefined;
      const providerErrors: string[] = [];
      for (const channel of candidates) {
        try {
          const response = await this.fetchProvider(
            `${channel.baseUrl.replace(/\/+$/, "")}/videos`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${channel.apiKey}`,
                "Idempotency-Key": taskId,
              },
              body: this.buildVideoProviderForm(body, upstreamModel),
              signal: AbortSignal.timeout(30_000),
            },
          );
          const parsed = await this.readJsonSafely(response);
          if (!response.ok) {
            const error: any = new Error(this.parseProviderError(parsed) || `HTTP ${response.status}`);
            error.definitiveHttpResponse = true;
            throw error;
          }
          responseBody = parsed;
          chosenChannel = channel;
          break;
        } catch (error: any) {
          providerErrors.push(`[${channel.name}]: ${error?.message || error}`);
          if (!error?.definitiveHttpResponse) throw error;
        }
      }
      if (!responseBody || !chosenChannel) {
        throw new Error(`Video generation failed across all channels:\n${providerErrors.join("\n")}`);
      }

      const immediateVideoUrl = responseBody?.video_url || responseBody?.videoUrl;
      if (immediateVideoUrl) {
        const localResult = await this.filesService.downloadAndSaveVideo(immediateVideoUrl, originUrl);
        this.setTaskStatus(taskId, "success", localResult);
        return;
      }
      const upstreamTaskId = responseBody?.id || responseBody?.task_id;
      if (!upstreamTaskId) throw new Error("No video task ID returned from upstream API");

      const pollState = {
        kind: "video",
        phase: "polling",
        upstreamTaskId: String(upstreamTaskId),
        providerId: chosenChannel.id,
        providerBaseUrl: chosenChannel.baseUrl,
        originUrl,
        deadlineAt: Date.now() + this.getVideoGenerationTimeoutMs(),
      };
      this.setTaskStatus(taskId, "generating", pollState);
      await this.pollVideoProviderTask(taskId, pollState);
    } catch (err: any) {
      console.error(`[runVideoGenerationTaskInBackground] Task ${taskId} failed:`, err);
      let errMsg = err?.message || "视频生成失败，请重试";
      if (err instanceof HttpException) {
        const response: any = err.getResponse();
        if (response && typeof response === "object" && response.error) errMsg = response.error;
      }
      this.setTaskStatus(taskId, "error", { error: errMsg });
    }
  }

  async generateVideoFromJson(
    body: GenerateVideoJsonRequest,
    originUrl: string,
    billingContext?: BillingTaskContext,
  ): Promise<any> {
    const preparedBody = await this.prepareVideoGenerationRequest(body);

    const taskId = crypto.randomUUID();
    this.setTaskStatus(taskId, "generating", {
      kind: "video",
      phase: "queued",
    });
    if (billingContext) {
      if (!this.billingService) throw new Error("Billing service is unavailable");
      this.billingService.attachTask(
        billingContext.operationId,
        taskId,
        billingContext.userId,
      );
    }

    void this.runVideoGenerationTaskInBackground(taskId, preparedBody, originUrl).catch(
      (error) => this.handleBackgroundTaskRejection(taskId, "video", error),
    );

    return {
      type: "video",
      taskId,
      status: "generating",
      model: preparedBody.model,
      seconds: preparedBody.seconds,
      size: preparedBody.size,
    };
  }

  async getVideoModelOptions(
    model: string,
  ): Promise<VideoModelOptionsResponse> {
    const mapping = await this.resolveModelMapping("video", model);
    const targetModel = mapping ? mapping.upstreamModel : model;
    const normalized = targetModel.toLowerCase();

    // 默认选项
    let sizes = [
      { label: "16:9 横屏", value: "16x9" },
      { label: "9:16 竖屏", value: "9x16" },
      { label: "1:1 方形", value: "1x1" },
    ];
    let minSeconds = 5;
    let maxSeconds = 10;
    let defaultSize = "16x9";
    let defaultSeconds = 5;
    let supportReferenceType = "first"; // Default is first frame only

    const configState = await this.modelConfigService.getConfig();
    let configSource: {
      sizes?: string[];
      minSeconds?: number;
      maxSeconds?: number;
      defaultSize?: string;
      defaultSeconds?: number;
      supportReferenceType?: string;
    } | null = null;

    if (mapping) {
      if (mapping.videoConfigId) {
        const found = configState.videoConfigs?.find(
          (c) => c.id === mapping.videoConfigId,
        );
        if (found) {
          configSource = found;
        }
      }
      if (!configSource) {
        const hasCustomConfig =
          (mapping.sizes && mapping.sizes.length > 0) ||
          mapping.minSeconds !== undefined ||
          mapping.maxSeconds !== undefined ||
          mapping.supportReferenceType;
        if (hasCustomConfig) {
          configSource = mapping;
        }
      }
    }

    const getFriendlySizeLabel = (val: string) => {
      const normalizedKey = val.toLowerCase().replace(":", "x");
      const mappingTable: Record<string, string> = {
        "16x9": "16:9 横屏",
        "9x16": "9:16 竖屏",
        "1x1": "1:1 方形",
        "4x3": "4:3 画幅",
        "3x4": "3:4 竖屏",
        "21x9": "21:9 宽屏",
      };
      return mappingTable[normalizedKey] || val.replace("x", ":");
    };

    if (configSource) {
      if (configSource.sizes && configSource.sizes.length > 0) {
        sizes = configSource.sizes.map((s) => ({
          label: getFriendlySizeLabel(s),
          value: s,
        }));
        defaultSize =
          configSource.defaultSize || configSource.sizes[0] || "16x9";
      }
      if (configSource.minSeconds !== undefined) {
        minSeconds = configSource.minSeconds;
      }
      if (configSource.maxSeconds !== undefined) {
        maxSeconds = configSource.maxSeconds;
      }
      if (configSource.defaultSeconds !== undefined) {
        defaultSeconds = configSource.defaultSeconds;
      } else {
        // Clamp fallback defaultSeconds within new min/max
        defaultSeconds = Math.max(minSeconds, Math.min(maxSeconds, defaultSeconds));
      }
      if (configSource.supportReferenceType) {
        supportReferenceType = configSource.supportReferenceType;
      }
    }

    const normalizedMinSeconds = Number.isSafeInteger(minSeconds) && minSeconds > 0
      ? minSeconds
      : 5;
    const normalizedMaxSeconds = Number.isSafeInteger(maxSeconds) && maxSeconds >= normalizedMinSeconds
      ? maxSeconds
      : Math.max(normalizedMinSeconds, 10);
    const normalizedDefaultSeconds = Number.isSafeInteger(defaultSeconds)
      ? Math.max(normalizedMinSeconds, Math.min(normalizedMaxSeconds, defaultSeconds))
      : normalizedMinSeconds;
    const normalizedSizes = sizes.filter(
      (option, index, all) => option.value && all.findIndex((item) => item.value === option.value) === index,
    );
    const normalizedDefaultSize = normalizedSizes.some((option) => option.value === defaultSize)
      ? defaultSize
      : normalizedSizes[0]?.value || defaultSize;
    const normalizedReferenceType = (["none", "first", "first_last"] as const).includes(
      supportReferenceType as any,
    )
      ? supportReferenceType as "none" | "first" | "first_last"
      : "none";

    return {
      model,
      sizes: normalizedSizes,
      minSeconds: normalizedMinSeconds,
      maxSeconds: normalizedMaxSeconds,
      defaults: {
        size: normalizedDefaultSize,
        seconds: normalizedDefaultSeconds,
      },
      supportReferenceType: normalizedReferenceType,
    };
  }

  private isLocalImageUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(
        url.hostname,
      );
    } catch {
      return value.startsWith("/files/") || value.startsWith("files/");
    }
  }

  private getImageFilename(source: string, mimeType: string): string {
    if (source.startsWith("http://") || source.startsWith("https://")) {
      try {
        const filename = new URL(source).pathname.split("/").pop();
        if (filename && filename.includes(".")) return filename;
      } catch {
        // Fall through to a generated filename.
      }
    }

    const extension =
      mimeType === "image/jpeg"
        ? "jpg"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType === "image/gif"
            ? "gif"
            : "png";
    return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${extension}`;
  }

  private async resolveImageUploadSource(source: string): Promise<{
    blob: Blob;
    dataUrl: string;
    filename: string;
  }> {
    const dataUrlMatch = source.match(
      /^data:([^;,]+);base64,([\s\S]+)$/i,
    );
    if (dataUrlMatch) {
      const mimeType = dataUrlMatch[1] || "image/png";
      const payload = dataUrlMatch[2];
      if (!payload) throw new Error("Invalid image data URL");
      const bytes = Buffer.from(payload, "base64");
      return {
        blob: new Blob([bytes], { type: mimeType }),
        dataUrl: source,
        filename: this.getImageFilename(source, mimeType),
      };
    }

    if (this.isLocalImageUrl(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to read local image: HTTP ${response.status}`);
      }
      const mimeType =
        response.headers.get("content-type")?.split(";")[0] || "image/png";
      if (!mimeType.startsWith("image/")) {
        throw new Error(`Local asset is not an image: ${mimeType}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        blob: new Blob([bytes], { type: mimeType }),
        dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
        filename: this.getImageFilename(source, mimeType),
      };
    }

    const formattedBase64 = source.startsWith("data:")
      ? source
      : `data:image/png;base64,${source}`;
    return this.resolveImageUploadSource(formattedBase64);
  }

  async uploadImageToHost(source: string): Promise<string> {
    if (!source || typeof source !== "string") return source;
    if (source.startsWith("[")) return source;

    const isHttpUrl =
      source.startsWith("http://") || source.startsWith("https://");
    if (isHttpUrl && !this.isLocalImageUrl(source)) return source;

    const cachedUrl = this.imageHostUrlCache.get(source);
    if (cachedUrl) return cachedUrl;

    const url =
      process.env.IMAGE_HOST_UPLOAD_URL ||
      "https://img.scdn.io/api/v1.php";
    const apiKey = process.env.IMAGE_HOST_API_KEY || "";
    let fallback = source;

    try {
      const image = await this.resolveImageUploadSource(source);
      fallback = image.dataUrl;
      const uploadUrl = new URL(url);
      const isScdn =
        uploadUrl.hostname === "img.scdn.io" &&
        uploadUrl.pathname.endsWith("/api/v1.php");
      const sendUpload = async () => {
        if (isScdn) {
          const form = new FormData();
          form.append("image", image.blob, image.filename);
          form.append("outputFormat", "auto");
          form.append(
            "cdn_domain",
            process.env.IMAGE_HOST_CDN_DOMAIN || "cloudflareimg.cdn.sn",
          );
          form.append(
            "storage_destination",
            process.env.IMAGE_HOST_STORAGE_DESTINATION || "local",
          );
          return fetch(url, {
            method: "POST",
            headers: apiKey ? { "X-API-Key": apiKey } : undefined,
            body: form,
          });
        }

        return fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: JSON.stringify({
            base64: image.dataUrl,
            filename: image.filename,
          }),
        });
      };

      let response = await sendUpload();
      if (response.status === 429) {
        const retryAfterSeconds = Number(
          response.headers.get("retry-after") || 5,
        );
        const retryDelay = Number.isFinite(retryAfterSeconds)
          ? Math.min(Math.max(retryAfterSeconds * 1000, 100), 10_000)
          : 5_000;
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        response = await sendUpload();
      }

      const resData = (await response.json()) as any;
      const hostedUrl = resData?.url || resData?.data?.url;
      if (response.ok && resData?.success && hostedUrl) {
        if (isHttpUrl) this.imageHostUrlCache.set(source, hostedUrl);
        return hostedUrl;
      }
      throw new Error(resData?.message || `HTTP ${response.status}`);
    } catch (err: any) {
      console.warn(
        "[uploadImageToHost] failed, falling back to inline image data:",
        err.message,
      );
      return fallback;
    }
  }

  async getAgentConfig() {
    return this.modelConfigService.getConfig();
  }
}
