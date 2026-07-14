import { Injectable, BadRequestException } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { join } from "path";
import type { YunwuApiPurpose, YunwuModel } from "../types";
import { SYSTEM_PROMPT } from "../agent/system-prompt";

export interface ModelMapping {
  id: string;
  label: string;
  purpose: YunwuApiPurpose;
  channelId: string;
  upstreamModel: string;
  enabled: boolean;
  notes?: string;
  brandInitial?: string;
  brandColor?: string;
  iconUrl?: string;
  sizes?: string[];
  qualities?: string[];
  aspectRatios?: string[];
  maxReferenceImages?: number;
  defaultSize?: string;
  defaultQuality?: string;
  qualityMode?: string;
  imageConfigId?: string;
  videoConfigId?: string;
  minSeconds?: number;
  maxSeconds?: number;
  defaultSeconds?: number;
  supportReferenceType?: string;
}

export interface ImageConfig {
  id: string;
  label: string;
  sizes?: string[];
  qualities?: string[];
  aspectRatios?: string[];
  maxReferenceImages?: number;
  defaultSize?: string;
  defaultQuality?: string;
  qualityMode?: string;
  notes?: string;
  maxGenerationCount?: number;
}

export interface VideoConfig {
  id: string;
  label: string;
  sizes?: string[];
  minSeconds?: number;
  maxSeconds?: number;
  defaultSize?: string;
  defaultSeconds?: number;
  supportReferenceType?: string;
  notes?: string;
}

export interface ModelConfigState {
  mappings: ModelMapping[];
  imageConfigs?: ImageConfig[];
  videoConfigs?: VideoConfig[];
  dictionaries?: {
    sizes: string[];
    aspectRatios: string[];
    qualities: string[];
    videoSizes?: string[];
  };
  agentConfig?: {
    systemPrompt: string;
    chatModel: string;
    visionModel?: string;
    /** Image model id for canvas local inpaint / 局部重绘. Empty = first enabled image mapping. */
    inpaintModel?: string;
  };
}

export type AgentConfigState = NonNullable<ModelConfigState["agentConfig"]>;

@Injectable()
export class ModelConfigService implements OnModuleInit {
  private DATA_DIR = join(process.cwd(), "data");
  private CONFIG_KEY = "current_config";

  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.db;
  }

  async onModuleInit() {
    // Check and run legacy JSON data migration
    await this.migrateLegacyData();
  }

  private async migrateLegacyData(): Promise<void> {
    const { existsSync, renameSync } = require("fs");
    const configJsonPath = join(this.DATA_DIR, "model-config.json");

    if (existsSync(configJsonPath)) {
      try {
        const { readFile } = require("fs/promises");
        const content = await readFile(configJsonPath, "utf-8");
        const parsed = JSON.parse(content || "{}");

        if (parsed && (parsed.mappings || parsed.agentConfig)) {
          // Normalize and prepare mapping structure
          const mappings = Array.isArray(parsed.mappings)
            ? parsed.mappings
                .map((item: any, index: number) => this.normalizeMapping(item, index))
                .filter(Boolean)
            : [];
          const imageConfigs = Array.isArray(parsed.imageConfigs)
            ? parsed.imageConfigs
                .map((item: any, index: number) => this.normalizeImageConfig(item, index))
                .filter(Boolean)
            : [];
          const rawDict = parsed.dictionaries;
          const dictionaries = {
            sizes: Array.isArray(rawDict?.sizes)
              ? rawDict.sizes.map((s: any) => this.normalizeString(s)).filter(Boolean)
              : ["1024x1024", "1536x1024", "2048x2048", "auto", "512", "0.5K", "1K", "2K", "4K"],
            aspectRatios: Array.isArray(rawDict?.aspectRatios)
              ? rawDict.aspectRatios.map((s: any) => this.normalizeString(s)).filter(Boolean)
              : ["1:1", "16:9", "9:16", "4:3", "3:4"],
            qualities: Array.isArray(rawDict?.qualities)
              ? rawDict.qualities.map((s: any) => this.normalizeString(s)).filter(Boolean)
              : ["standard", "hd", "low", "medium", "high", "auto", "512", "0.5K", "1K", "2K", "4K"]
          };
          const agentConfig = this.normalizeAgentConfig(parsed.agentConfig);

          const state: ModelConfigState = {
            mappings: mappings as ModelMapping[],
            imageConfigs: imageConfigs as ImageConfig[],
            dictionaries,
            agentConfig,
          };

          const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO model_config (key, data)
            VALUES ($key, $data)
          `);
          stmt.run({
            $key: this.CONFIG_KEY,
            $data: JSON.stringify(state)
          });
          console.log("Successfully migrated model configuration from model-config.json to SQLite database.");
        }

        // Rename legacy file to .bak extension
        renameSync(configJsonPath, `${configJsonPath}.bak`);
      } catch (err) {
        console.error("Error migrating legacy model config JSON data:", err);
      }
    }
  }

  private getDefaultState(): ModelConfigState {
    return {
      mappings: [],
      imageConfigs: [],
      videoConfigs: [],
      dictionaries: {
        sizes: ["1024x1024", "1536x1024", "2048x2048", "auto", "512", "0.5K", "1K", "2K", "4K"],
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        qualities: ["standard", "hd", "low", "medium", "high", "auto", "512", "0.5K", "1K", "2K", "4K"],
        videoSizes: ["16x9", "9x16", "1x1", "4x3", "3x4", "21x9"]
      },
      agentConfig: {
        systemPrompt: SYSTEM_PROMPT,
        chatModel: "gpt-4o-mini",
        visionModel: "gpt-4o",
        inpaintModel: "",
      }
    };
  }

  private normalizeNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }

  private defaultAgentConfig(): AgentConfigState {
    return {
      systemPrompt: SYSTEM_PROMPT,
      chatModel: "gpt-4o-mini",
      visionModel: "gpt-4o",
      inpaintModel: "",
    };
  }

  /**
   * Merge partial agentConfig onto a base so callers that only update mappings
   * (Models page) do not wipe chat/vision/inpaint model choices.
   */
  private mergeAgentConfig(raw: any, base?: AgentConfigState | null): AgentConfigState {
    const fallback = base ?? this.defaultAgentConfig();
    const pickString = (value: unknown, fallbackValue: string) =>
      typeof value === "string" && value.trim() ? value.trim() : fallbackValue;
    // inpaintModel may intentionally be "" (= auto / first image mapping)
    const inpaintRaw = raw?.inpaintModel;
    const inpaintModel =
      typeof inpaintRaw === "string" ? inpaintRaw.trim() : (fallback.inpaintModel ?? "");

    return {
      systemPrompt: pickString(raw?.systemPrompt, fallback.systemPrompt),
      chatModel: pickString(raw?.chatModel, fallback.chatModel),
      visionModel: pickString(raw?.visionModel, fallback.visionModel || "gpt-4o"),
      inpaintModel,
    };
  }

  private normalizeAgentConfig(raw: any): AgentConfigState {
    return this.mergeAgentConfig(raw, this.defaultAgentConfig());
  }

  private normalizeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  private normalizePurpose(value: unknown): YunwuApiPurpose {
    const normalized = this.normalizeString(value);
    if (normalized === "image" || normalized === "video") return normalized;
    return "chat";
  }

  private normalizeMapping(raw: any, index: number): ModelMapping | null {
    const id = this.normalizeString(raw?.id) || `model-${index + 1}`;
    const label = this.normalizeString(raw?.label) || id;
    const channelId = this.normalizeString(raw?.channelId);
    const upstreamModel = this.normalizeString(raw?.upstreamModel);

    if (!channelId || !upstreamModel) return null;

    const mapping: ModelMapping = {
      id,
      label,
      purpose: this.normalizePurpose(raw?.purpose),
      channelId,
      upstreamModel,
      enabled: raw?.enabled !== false,
      notes: this.normalizeString(raw?.notes) || undefined,
      brandInitial: this.normalizeString(raw?.brandInitial) || undefined,
      brandColor: this.normalizeString(raw?.brandColor) || undefined,
      iconUrl: this.normalizeString(raw?.iconUrl) || undefined,
      imageConfigId: this.normalizeString(raw?.imageConfigId) || undefined,
      videoConfigId: this.normalizeString(raw?.videoConfigId) || undefined,
    };

    if (mapping.purpose === "image") {
      if (Array.isArray(raw?.sizes)) {
        mapping.sizes = raw.sizes.map((s: any) => this.normalizeString(s)).filter(Boolean);
      }
      if (Array.isArray(raw?.qualities)) {
        mapping.qualities = raw.qualities.map((s: any) => this.normalizeString(s)).filter(Boolean);
      }
      if (Array.isArray(raw?.aspectRatios)) {
        mapping.aspectRatios = raw.aspectRatios.map((s: any) => this.normalizeString(s)).filter(Boolean);
      }
      if (typeof raw?.maxReferenceImages === "number") {
        mapping.maxReferenceImages = raw.maxReferenceImages;
      }
      if (raw?.defaultSize) {
        mapping.defaultSize = this.normalizeString(raw.defaultSize) || undefined;
      }
      if (raw?.defaultQuality) {
        mapping.defaultQuality = this.normalizeString(raw.defaultQuality) || undefined;
      }
      if (raw?.qualityMode) {
        mapping.qualityMode = this.normalizeString(raw.qualityMode) || undefined;
      }
    }

    if (mapping.purpose === "video") {
      if (Array.isArray(raw?.sizes)) {
        mapping.sizes = raw.sizes.map((s: any) => this.normalizeString(s)).filter(Boolean);
      }
      if (raw?.minSeconds !== undefined) {
        mapping.minSeconds = this.normalizeNumber(raw.minSeconds);
      } else if (Array.isArray(raw?.seconds) && raw.seconds.length > 0) {
        const nums = raw.seconds.map((s: any) => Number(s)).filter((n: any) => !isNaN(n));
        if (nums.length > 0) mapping.minSeconds = Math.min(...nums);
      }
      if (raw?.maxSeconds !== undefined) {
        mapping.maxSeconds = this.normalizeNumber(raw.maxSeconds);
      } else if (Array.isArray(raw?.seconds) && raw.seconds.length > 0) {
        const nums = raw.seconds.map((s: any) => Number(s)).filter((n: any) => !isNaN(n));
        if (nums.length > 0) mapping.maxSeconds = Math.max(...nums);
      }
      if (raw?.defaultSeconds !== undefined) {
        mapping.defaultSeconds = this.normalizeNumber(raw.defaultSeconds);
      } else if (raw?.defaultSeconds) {
        const dNum = Number(raw.defaultSeconds);
        if (!isNaN(dNum)) mapping.defaultSeconds = dNum;
      }
      if (raw?.defaultSize) {
        mapping.defaultSize = this.normalizeString(raw.defaultSize) || undefined;
      }
      if (raw?.supportReferenceType) {
        mapping.supportReferenceType = this.normalizeString(raw.supportReferenceType) || undefined;
      }
    }

    return mapping;
  }

  private normalizeImageConfig(raw: any, index: number): ImageConfig | null {
    const id = this.normalizeString(raw?.id) || `config-${index + 1}`;
    const label = this.normalizeString(raw?.label) || id;
    const config: ImageConfig = {
      id,
      label,
    };
    if (Array.isArray(raw?.sizes)) {
      config.sizes = raw.sizes.map((s: any) => this.normalizeString(s)).filter(Boolean);
    }
    if (Array.isArray(raw?.qualities)) {
      config.qualities = raw.qualities.map((s: any) => this.normalizeString(s)).filter(Boolean);
    }
    if (Array.isArray(raw?.aspectRatios)) {
      config.aspectRatios = raw.aspectRatios.map((s: any) => this.normalizeString(s)).filter(Boolean);
    }
    if (typeof raw?.maxReferenceImages === "number") {
      config.maxReferenceImages = raw.maxReferenceImages;
    }
    if (raw?.defaultSize) {
      config.defaultSize = this.normalizeString(raw.defaultSize) || undefined;
    }
    if (raw?.defaultQuality) {
      config.defaultQuality = this.normalizeString(raw.defaultQuality) || undefined;
    }
    if (raw?.qualityMode) {
      config.qualityMode = this.normalizeString(raw.qualityMode) || undefined;
    }
    if (raw?.notes) {
      config.notes = this.normalizeString(raw.notes) || undefined;
    }
    if (typeof raw?.maxGenerationCount === "number") {
      config.maxGenerationCount = raw.maxGenerationCount;
    } else {
      config.maxGenerationCount = 1;
    }
    return config;
  }

  private normalizeVideoConfig(raw: any, index: number): VideoConfig | null {
    const id = this.normalizeString(raw?.id) || `video-config-${index + 1}`;
    const label = this.normalizeString(raw?.label) || id;
    const config: VideoConfig = {
      id,
      label,
    };
    if (Array.isArray(raw?.sizes)) {
      config.sizes = raw.sizes.map((s: any) => this.normalizeString(s)).filter(Boolean);
    }
    if (raw?.minSeconds !== undefined) {
      config.minSeconds = this.normalizeNumber(raw.minSeconds);
    } else if (Array.isArray(raw?.seconds) && raw.seconds.length > 0) {
      const nums = raw.seconds.map((s: any) => Number(s)).filter((n: any) => !isNaN(n));
      if (nums.length > 0) config.minSeconds = Math.min(...nums);
    }
    if (raw?.maxSeconds !== undefined) {
      config.maxSeconds = this.normalizeNumber(raw.maxSeconds);
    } else if (Array.isArray(raw?.seconds) && raw.seconds.length > 0) {
      const nums = raw.seconds.map((s: any) => Number(s)).filter((n: any) => !isNaN(n));
      if (nums.length > 0) config.maxSeconds = Math.max(...nums);
    }
    if (raw?.defaultSeconds !== undefined) {
      config.defaultSeconds = this.normalizeNumber(raw.defaultSeconds);
    } else if (raw?.defaultSeconds) {
      const dNum = Number(raw.defaultSeconds);
      if (!isNaN(dNum)) config.defaultSeconds = dNum;
    }
    if (raw?.defaultSize) {
      config.defaultSize = this.normalizeString(raw.defaultSize) || undefined;
    }
    if (raw?.supportReferenceType) {
      config.supportReferenceType = this.normalizeString(raw.supportReferenceType) || undefined;
    }
    if (raw?.notes) {
      config.notes = this.normalizeString(raw.notes) || undefined;
    }
    return config;
  }

  async getConfig(): Promise<ModelConfigState> {
    try {
      const query = this.db.query("SELECT data FROM model_config WHERE key = $key");
      const row = query.get({ $key: this.CONFIG_KEY }) as { data: string } | null;
      
      let parsed: any = {};
      if (row) {
        parsed = JSON.parse(row.data || "{}");
      } else {
        // Seed default config into DB if none exists
        const defaultState = this.getDefaultState();
        const stmt = this.db.prepare(`
          INSERT INTO model_config (key, data)
          VALUES ($key, $data)
        `);
        stmt.run({
          $key: this.CONFIG_KEY,
          $data: JSON.stringify(defaultState)
        });
        parsed = defaultState;
      }

      const mappings = Array.isArray(parsed.mappings)
        ? parsed.mappings
            .map((item: any, index: number) => this.normalizeMapping(item, index))
            .filter(Boolean)
        : [];
      const imageConfigs = Array.isArray(parsed.imageConfigs)
        ? parsed.imageConfigs
            .map((item: any, index: number) => this.normalizeImageConfig(item, index))
            .filter(Boolean)
        : [];
      const videoConfigs = Array.isArray(parsed.videoConfigs)
        ? parsed.videoConfigs
            .map((item: any, index: number) => this.normalizeVideoConfig(item, index))
            .filter(Boolean)
        : [];
      const rawDict = parsed.dictionaries;
      const dictionaries = {
        sizes: Array.isArray(rawDict?.sizes)
          ? rawDict.sizes.map((s: any) => this.normalizeString(s)).filter(Boolean)
          : ["1024x1024", "1536x1024", "2048x2048", "auto", "512", "0.5K", "1K", "2K", "4K"],
        aspectRatios: Array.isArray(rawDict?.aspectRatios)
          ? rawDict.aspectRatios.map((s: any) => this.normalizeString(s)).filter(Boolean)
          : ["1:1", "16:9", "9:16", "4:3", "3:4"],
        qualities: Array.isArray(rawDict?.qualities)
          ? rawDict.qualities.map((s: any) => this.normalizeString(s)).filter(Boolean)
          : ["standard", "hd", "low", "medium", "high", "auto", "512", "0.5K", "1K", "2K", "4K"],
        videoSizes: Array.isArray(rawDict?.videoSizes)
          ? rawDict.videoSizes.map((s: any) => this.normalizeString(s)).filter(Boolean)
          : ["16x9", "9x16", "1x1", "4x3", "3x4", "21x9"]
      };
      const agentConfig = this.normalizeAgentConfig(parsed.agentConfig);
      return {
        mappings: mappings as ModelMapping[],
        imageConfigs: imageConfigs as ImageConfig[],
        videoConfigs: videoConfigs as VideoConfig[],
        dictionaries,
        agentConfig,
      };
    } catch (err) {
      console.error("Failed to query model config from database:", err);
      return this.getDefaultState();
    }
  }

  async updateConfig(nextState: any): Promise<ModelConfigState> {
    // Partial updates (e.g. Models page only sends mappings) must not wipe
    // agentConfig / other sections — that was resetting chat/vision to gpt-4o daily.
    const existing = await this.getConfig();

    const sanitizedMappings = Array.isArray(nextState?.mappings)
      ? nextState.mappings
          .map((item: any, index: number) => this.normalizeMapping(item, index))
          .filter(Boolean)
      : existing.mappings;
    const sanitizedConfigs = Array.isArray(nextState?.imageConfigs)
      ? nextState.imageConfigs
          .map((item: any, index: number) => this.normalizeImageConfig(item, index))
          .filter(Boolean)
      : (existing.imageConfigs ?? []);
    const sanitizedVideoConfigs = Array.isArray(nextState?.videoConfigs)
      ? nextState.videoConfigs
          .map((item: any, index: number) => this.normalizeVideoConfig(item, index))
          .filter(Boolean)
      : (existing.videoConfigs ?? []);

    // Validate unique model IDs and channel + upstreamModel combination
    const idSet = new Set<string>();
    const channelModelSet = new Set<string>();
    for (const mapping of sanitizedMappings) {
      if (!mapping) continue;
      const idLower = mapping.id.toLowerCase();
      if (idSet.has(idLower)) {
        throw new BadRequestException(`前端 ID "${mapping.id}" 已存在，不可重复添加`);
      }
      idSet.add(idLower);

      const channelModelKey = `${mapping.channelId}:${mapping.upstreamModel.toLowerCase()}`;
      if (channelModelSet.has(channelModelKey)) {
        throw new BadRequestException(`上游渠道下已配置相同的上游模型 "${mapping.upstreamModel}"`);
      }
      channelModelSet.add(channelModelKey);
    }

    // Validate unique image config IDs
    const templateIdSet = new Set<string>();
    for (const config of sanitizedConfigs) {
      if (!config) continue;
      const idLower = config.id.toLowerCase();
      if (templateIdSet.has(idLower)) {
        throw new BadRequestException(`模板 ID "${config.id}" 已存在，不可重复添加`);
      }
      templateIdSet.add(idLower);
    }

    // Validate unique video config IDs
    const videoTemplateIdSet = new Set<string>();
    for (const config of sanitizedVideoConfigs) {
      if (!config) continue;
      const idLower = config.id.toLowerCase();
      if (videoTemplateIdSet.has(idLower)) {
        throw new BadRequestException(`视频模板 ID "${config.id}" 已存在，不可重复添加`);
      }
      videoTemplateIdSet.add(idLower);
    }

    try {
      const rawDict = nextState?.dictionaries;
      const defaultDict = existing.dictionaries ?? this.getDefaultState().dictionaries!;
      const sanitizedDictionaries = rawDict
        ? {
            sizes: Array.isArray(rawDict?.sizes)
              ? rawDict.sizes.map((s: any) => this.normalizeString(s)).filter(Boolean)
              : defaultDict.sizes,
            aspectRatios: Array.isArray(rawDict?.aspectRatios)
              ? rawDict.aspectRatios.map((s: any) => this.normalizeString(s)).filter(Boolean)
              : defaultDict.aspectRatios,
            qualities: Array.isArray(rawDict?.qualities)
              ? rawDict.qualities.map((s: any) => this.normalizeString(s)).filter(Boolean)
              : defaultDict.qualities,
            videoSizes: Array.isArray(rawDict?.videoSizes)
              ? rawDict.videoSizes.map((s: any) => this.normalizeString(s)).filter(Boolean)
              : (defaultDict.videoSizes ?? ["16x9", "9x16", "1x1", "4x3", "3x4", "21x9"]),
          }
        : defaultDict;

      // Only rewrite agentConfig when the client explicitly sends it.
      const sanitizedAgent =
        nextState?.agentConfig !== undefined && nextState?.agentConfig !== null
          ? this.mergeAgentConfig(nextState.agentConfig, existing.agentConfig)
          : this.normalizeAgentConfig(existing.agentConfig);

      const state: ModelConfigState = {
        mappings: sanitizedMappings as ModelMapping[],
        imageConfigs: sanitizedConfigs as ImageConfig[],
        videoConfigs: sanitizedVideoConfigs as VideoConfig[],
        dictionaries: sanitizedDictionaries,
        agentConfig: sanitizedAgent,
      };

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO model_config (key, data)
        VALUES ($key, $data)
      `);
      stmt.run({
        $key: this.CONFIG_KEY,
        $data: JSON.stringify(state)
      });
      return state;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      console.error("Failed to update model config in database:", err);
      throw new BadRequestException("保存模型配置失败，请重试");
    }
  }

  /** Resolve model id for canvas inpaint (局部重绘). */
  async getInpaintModelId(): Promise<string | undefined> {
    const config = await this.getConfig();
    const configured = config.agentConfig?.inpaintModel?.trim();
    if (configured) return configured;
    const images = await this.getEnabledMappingsByPurpose("image");
    return images.find((m) => m.enabled)?.id;
  }

  async getEnabledMappingsByPurpose(purpose: YunwuApiPurpose): Promise<ModelMapping[]> {
    const config = await this.getConfig();
    return config.mappings.filter((item) => item.enabled && item.purpose === purpose);
  }

  async filterModelsForDisplay(purpose: YunwuApiPurpose, models: YunwuModel[]): Promise<YunwuModel[]> {
    const config = await this.getConfig();
    const mappings = config.mappings.filter((item) => item.purpose === purpose && item.enabled);

    if (mappings.length === 0) {
      return models;
    }

    const upstreamSet = new Set(models.map((m) => m.id.toLowerCase()));
    return mappings
      .filter((m) => upstreamSet.has(m.upstreamModel.toLowerCase()) || m.upstreamModel === "*")
      .map((m) => ({
        id: m.id,
        object: "model",
        ownedBy: m.channelId,
      }));
  }
}
