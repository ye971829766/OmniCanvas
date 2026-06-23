import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { FilesService } from "../files/files.service";
import { ChannelsService, type Channel } from "../channels/channels.service";
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
@Injectable()
export class AiService {
  private YUNWU_BASE_URL = (
    process.env.BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.YUNWU_BASE_URL ||
    "https://yunwu.ai/v1"
  ).replace(/\/+$/, "");
  private YUNWU_IMAGE_MODEL = process.env.YUNWU_IMAGE_MODEL || "gpt-image-1";
  private YUNWU_CHAT_MODEL = process.env.YUNWU_CHAT_MODEL || "gpt-4o-mini";
  private MAX_REFERENCE_IMAGES = 16;
  private ALLOWED_OUTPUT_FORMATS = new Set(["png", "jpeg", "webp"]);

  constructor(
    private readonly filesService: FilesService,
    private readonly channelsService: ChannelsService,
    private readonly modelConfigService: ModelConfigService,
  ) {}

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

      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err: any) {
        // Bun's fetch sometimes rejects valid provider CDNs with
        // "unknown certificate verification error". Retry once with TLS
        // verification disabled, scoped to this upstream request only.
        const msg = String(err?.message || err).toLowerCase();
        const isCertError =
          msg.includes("certificate") ||
          msg.includes("tls") ||
          msg.includes("ssl") ||
          msg.includes("self-signed") ||
          msg.includes("unable to verify");
        if (!isCertError) throw err;
        console.warn(
          `[callYunwuApi] TLS verification failed for ${url}; retrying without verification`,
        );
        response = await fetch(url, {
          ...init,
          tls: { rejectUnauthorized: false },
        });
      }

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
        defaults: { size: "auto", quality: "auto" },
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

  async chatWithYunwu(body: any): Promise<ChatResponse> {
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

  private tasks = new Map<string, any>();

  getTaskStatus(id: string) {
    const task = this.tasks.get(id);
    if (!task) {
      throw new HttpException(
        { error: "Task not found" },
        HttpStatus.NOT_FOUND,
      );
    }
    return task;
  }

  async runGenerationTaskInBackground(
    taskId: string,
    body: GenerateImageJsonRequest,
    originUrl: string,
  ) {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const outputFormat = this.getOutputFormat(body?.outputFormat);
    let model = this.getSelectedModel(body?.model, "");
    if (!model) {
      const mappings = await this.modelConfigService.getEnabledMappingsByPurpose("image");
      const activeMapping = mappings.find(m => m.enabled);
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
      let imageUrl = "";

      const route = await this.resolveChannelAndModel("image", model);
      const upstreamModel = route.upstreamModel;

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
        const nativeBaseUrl = baseUrl.replace(/\/v1\/?$/, "") + "/v1beta";
        const url = `${nativeBaseUrl}/models/${upstreamModel}:generateContent?key=${apiKey}`;
        const isYunWu = baseUrl.includes("yunwu.ai");
        const googleClient = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            baseUrl: isYunWu ? url : baseUrl,
          },
        });

        const contentsParts: any[] = [{ text: prompt }];

        // Support reference images (Image-to-Image / Multi-modal)
        if (Array.isArray(body?.images) && body.images.length > 0) {
          body.images.forEach((imgBase64: any) => {
            if (typeof imgBase64 === "string") {
              const matches = imgBase64.match(
                /^data:(image\/\w+);base64,(.+)$/,
              );
              if (matches && matches[2]) {
                contentsParts.push({
                  inline_data: {
                    mime_type: matches[1]!,
                    data: matches[2]!,
                  },
                });
              }
            }
          });
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

        const responseFromGeminiSdk = await googleClient.models.generateContent(
          {
            model: upstreamModel,
            contents: payload.contents,
            config: payload.generationConfig,
          },
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

        const filename = await this.filesService.saveGeneratedImage(
          responseFromGeminiSdk,
          outputFormat,
        );
        imageUrl = `${originUrl}/files/${filename}`;
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
            typeof body?.size === "string" ? body.size : "1024x1024",
          );
          upstreamForm.append("output_format", outputFormat);

          const quality =
            typeof body?.quality === "string" ? body.quality.trim() : "";
          if (quality) {
            upstreamForm.append("quality", quality);
            upstreamForm.append("image_size", quality);
            upstreamForm.append("imageSize", quality);
          }

          const aspectRatio =
            typeof body?.aspectRatio === "string"
              ? body.aspectRatio.trim()
              : "";
          if (aspectRatio) {
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
        
       
          const filename = await this.filesService.saveGeneratedImage(
            providerBody,
            outputFormat,
          );
          imageUrl = `${originUrl}/files/${filename}`;
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
            size: typeof body?.size === "string" ? body.size : "1024x1024",
            n: body?.n || 1,
          };

          if (typeof body?.quality === "string" && body.quality.trim()) {
            generateParams.quality = body.quality.trim();
          }

          const sdkResponse = await openAi.images.generate(generateParams as any);
          const providerBody = JSON.parse(JSON.stringify(sdkResponse));

          const filename = await this.filesService.saveGeneratedImage(
            providerBody,
            outputFormat,
          );
          imageUrl = `${originUrl}/files/${filename}`;
        }
      }

      this.tasks.set(taskId, {
        id: taskId,
        status: "success",
        imageUrl,
      });
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
      this.tasks.set(taskId, {
        id: taskId,
        status: "error",
        error: errMsg,
      });
    }
  }

  async generateImageFromJson(
    body: GenerateImageJsonRequest,
    originUrl: string,
  ): Promise<GenerateImageResponse> {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new HttpException(
        { error: "Missing prompt" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const taskId = crypto.randomUUID();
    this.tasks.set(taskId, {
      id: taskId,
      status: "generating",
    });

    this.runGenerationTaskInBackground(taskId, body, originUrl);

    return {
      type: "image",
      taskId,
      status: "generating",
    };
  }

  async runVideoGenerationTaskInBackground(
    taskId: string,
    body: GenerateVideoJsonRequest,
    originUrl: string,
  ) {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const model = this.getSelectedModel(body?.model, "veo_3_1_fast_vip");
    const seconds =
      typeof body?.seconds === "string" ? body.seconds.trim() : "8";
    const size = typeof body?.size === "string" ? body.size.trim() : "16x9";
    const watermark =
      typeof body?.watermark === "string" ? body.watermark.trim() : "false";

    try {
      const route = await this.resolveChannelAndModel("video", model);
      const upstreamModel = route.upstreamModel;
      const channels = route.channel ? [route.channel] : [];

      const isMockMode =
        process.env.MOCK_VIDEO === "true" ||
        (channels.length === 0 && !this.getYunwuApiKey("video"));

      if (!isMockMode && channels.length === 0) {
        throw new Error("未配置该模型的可用渠道");
      }

      const upstreamForm = new FormData();
      upstreamForm.append("model", upstreamModel);
      upstreamForm.append("prompt", prompt);
      upstreamForm.append("seconds", seconds);
      upstreamForm.append("size", size);
      upstreamForm.append("watermark", watermark);

      if (
        typeof body?.input_reference === "string" &&
        body.input_reference.startsWith("data:")
      ) {
        const base64Str = body.input_reference;
        const matches = base64Str.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches && matches[2]) {
          const mimeType = matches[1]!;
          const base64Data = matches[2]!;
          const buffer = Buffer.from(base64Data, "base64");
          const extension = mimeType.split("/")[1] || "png";
          const file = new File([buffer], `input_reference.${extension}`, {
            type: mimeType,
          });
          upstreamForm.append("input_reference", file as any, file.name);
        }
      }

      if (isMockMode) {
        // Simulate video generation with a quick 2-second delay
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const localResult =
          await this.filesService.generateMockVideo(originUrl);
        this.tasks.set(taskId, {
          id: taskId,
          status: "success",
          videoUrl: localResult.videoUrl,
          thumbnailUrl: localResult.thumbnailUrl,
        });
        return;
      }

      let success = false;
      let responseBody: any = null;
      let chosenBaseUrl = "";
      let chosenApiKey = "";

      const attemptVideoCall = async (baseUrl: string, key: string) => {
        const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/videos`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
          },
          body: upstreamForm,
          verbose: true,
        } as any);

        const resBody = await this.readJsonSafely(response);
        if (!response.ok) {
          throw new Error(
            this.parseProviderError(resBody) || `HTTP ${response.status}`,
          );
        }
        return resBody;
      };

      const errors: string[] = [];

      // Try channels in order
      for (const channel of channels) {
        try {
          responseBody = await attemptVideoCall(
            channel.baseUrl,
            channel.apiKey,
          );
          chosenBaseUrl = channel.baseUrl;
          chosenApiKey = channel.apiKey;
          success = true;
          break;
        } catch (err: any) {
          console.warn(
            `[VideoGenTask] Channel ${channel.name} failed to create task:`,
            err.message,
          );
          errors.push(`[Channel ${channel.name}]: ${err.message}`);
        }
      }

      if (!success || !responseBody) {
        throw new Error(
          `Video generation failed across all channels:\n${errors.join("\n")}`,
        );
      }

      const yunwuTaskId = responseBody?.id;
      if (!yunwuTaskId) {
        throw new Error("No video task ID returned from upstream API");
      }

      let attempts = 0;
      const maxAttempts = 600; // 5 minutes max
      let finished = false;

      while (!finished && attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const statusRes = await fetch(
          `${chosenBaseUrl.replace(/\/+$/, "")}/videos/${yunwuTaskId}`,
          {
            headers: {
              Authorization: `Bearer ${chosenApiKey}`,
            },
            verbose: true,
          } as any,
        );

        const statusData = await this.readJsonSafely(statusRes);

        if (!statusRes.ok) {
          console.warn(
            `[VideoTaskPolling] Failed to poll status for ${yunwuTaskId}:`,
            statusData,
          );
          continue;
        }

        const status = statusData?.status;
        if (status === "succeeded" || status === "success") {
          finished = true;
          const videoUrl = statusData?.video_url;
          if (!videoUrl) {
            throw new Error("Succeeded status but no video_url returned");
          }

          const localResult = await this.filesService.downloadAndSaveVideo(
            videoUrl,
            originUrl,
          );

          this.tasks.set(taskId, {
            id: taskId,
            status: "success",
            videoUrl: localResult.videoUrl,
            thumbnailUrl: localResult.thumbnailUrl,
          });
        } else if (status === "failed" || status === "error") {
          finished = true;
          throw new Error(
            statusData?.error || "Video generation failed upstream",
          );
        }
      }

      if (!finished) {
        throw new Error("Video generation timed out");
      }
    } catch (err: any) {
      console.error(
        `[runVideoGenerationTaskInBackground] Task ${taskId} failed:`,
        err,
      );
      let errMsg = err.message || "视频生成失败，请重试";
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
      this.tasks.set(taskId, {
        id: taskId,
        status: "error",
        error: errMsg,
      });
    }
  }

  async generateVideoFromJson(body: GenerateVideoJsonRequest, originUrl: string): Promise<any> {
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new HttpException(
        { error: "Missing prompt" },
        HttpStatus.BAD_REQUEST,
      );
    }

    const taskId = crypto.randomUUID();
    this.tasks.set(taskId, {
      id: taskId,
      status: "generating",
    });

    this.runVideoGenerationTaskInBackground(taskId, body, originUrl);

    return {
      type: "video",
      taskId,
      status: "generating",
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
    let seconds = [
      { label: "5 秒", value: "5" },
      { label: "8 秒", value: "8" },
      { label: "10 秒", value: "10" },
    ];
    let defaultSize = "16x9";
    let defaultSeconds = "5";

    if (normalized.includes("veo")) {
      sizes = [
        { label: "16:9 横屏", value: "16x9" },
        { label: "9:16 竖屏", value: "9x16" },
        { label: "1:1 方形", value: "1x1" },
      ];
      seconds = [
        { label: "5 秒", value: "5" },
        { label: "8 秒", value: "8" },
      ];
      defaultSize = "16x9";
      defaultSeconds = "8";
    } else if (normalized.includes("luma")) {
      sizes = [
        { label: "16:9 横屏", value: "16x9" },
        { label: "9:16 竖屏", value: "9x16" },
        { label: "1:1 方形", value: "1x1" },
        { label: "4:3 画幅", value: "4x3" },
        { label: "3:4 竖屏", value: "3x4" },
        { label: "21:9 宽屏", value: "21x9" },
      ];
      seconds = [
        { label: "5 秒", value: "5" },
        { label: "10 秒", value: "10" },
      ];
      defaultSize = "16x9";
      defaultSeconds = "5";
    } else if (normalized.includes("kling")) {
      sizes = [
        { label: "16:9 横屏", value: "16x9" },
        { label: "9:16 竖屏", value: "9x16" },
        { label: "1:1 方形", value: "1x1" },
        { label: "4:3 画幅", value: "4x3" },
        { label: "3:4 竖屏", value: "3x4" },
      ];
      seconds = [
        { label: "5 秒", value: "5" },
        { label: "10 秒", value: "10" },
      ];
      defaultSize = "16x9";
      defaultSeconds = "5";
    } else if (
      normalized.includes("runway") ||
      normalized.includes("gen3") ||
      normalized.includes("gen-3")
    ) {
      sizes = [
        { label: "16:9 横屏", value: "16x9" },
        { label: "9:16 竖屏", value: "9x16" },
      ];
      seconds = [
        { label: "5 秒", value: "5" },
        { label: "10 秒", value: "10" },
      ];
      defaultSize = "16x9";
      defaultSeconds = "5";
    } else if (
      normalized.includes("minimax") ||
      normalized.includes("hailuo")
    ) {
      sizes = [{ label: "16:9 横屏", value: "16x9" }];
      seconds = [{ label: "6 秒", value: "6" }];
      defaultSize = "16x9";
      defaultSeconds = "6";
    } else if (normalized.includes("cogvideo")) {
      sizes = [
        { label: "16:9 横屏", value: "16x9" },
        { label: "9:16 竖屏", value: "9x16" },
        { label: "1:1 方形", value: "1x1" },
      ];
      seconds = [
        { label: "5 秒", value: "5" },
        { label: "10 秒", value: "10" },
      ];
      defaultSize = "16x9";
      defaultSeconds = "5";
    }

    return {
      model,
      sizes,
      seconds,
      defaults: {
        size: defaultSize,
        seconds: defaultSeconds,
      },
    };
  }

  async uploadImageToHost(base64: string): Promise<string> {
    if (!base64 || typeof base64 !== 'string') return base64;
    if (base64.startsWith('http://') || base64.startsWith('https://') || base64.startsWith('[')) {
      return base64;
    }
    const url = "http://101.200.138.2:8092/api/upload/private";
    const apiKey = "sk-a9f76e82c4df42f58afbefd53d3b4f8e";
    
    let formattedBase64 = base64;
    if (!base64.startsWith('data:')) {
      formattedBase64 = `data:image/png;base64,${base64}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey
        },
        body: JSON.stringify({
          base64: formattedBase64,
          filename: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`
        })
      });
      
      const resData = await response.json() as any;
      if (response.ok && resData && resData.success && resData.data && resData.data.url) {
        return resData.data.url;
      }
      throw new Error(resData?.message || `HTTP ${response.status}`);
    } catch (err: any) {
      console.warn("[uploadImageToHost] failed, falling back to base64:", err.message);
      return base64;
    }
  }

  async getAgentConfig() {
    return this.modelConfigService.getConfig();
  }
}
