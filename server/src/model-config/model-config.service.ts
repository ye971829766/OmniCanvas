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

export interface ModelConfigState {
  mappings: ModelMapping[];
  imageConfigs?: ImageConfig[];
  dictionaries?: {
    sizes: string[];
    aspectRatios: string[];
    qualities: string[];
  };
  agentConfig?: {
    systemPrompt: string;
    chatModel: string;
    visionModel?: string;
  };
}

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
      dictionaries: {
        sizes: ["1024x1024", "1536x1024", "2048x2048", "auto", "512", "0.5K", "1K", "2K", "4K"],
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        qualities: ["standard", "hd", "low", "medium", "high", "auto", "512", "0.5K", "1K", "2K", "4K"]
      },
      agentConfig: {
        systemPrompt: SYSTEM_PROMPT,
        chatModel: "gpt-4o-mini",
        visionModel: "gpt-4o"
      }
    };
  }

  private normalizeAgentConfig(raw: any): { systemPrompt: string; chatModel: string; visionModel?: string } {
    return {
      systemPrompt: typeof raw?.systemPrompt === "string" ? raw.systemPrompt : SYSTEM_PROMPT,
      chatModel: typeof raw?.chatModel === "string" ? raw.chatModel : "gpt-4o-mini",
      visionModel: typeof raw?.visionModel === "string" ? raw.visionModel : "gpt-4o"
    };
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
      return {
        mappings: mappings as ModelMapping[],
        imageConfigs: imageConfigs as ImageConfig[],
        dictionaries,
        agentConfig,
      };
    } catch (err) {
      console.error("Failed to query model config from database:", err);
      return this.getDefaultState();
    }
  }

  async updateConfig(nextState: any): Promise<ModelConfigState> {
    const sanitizedMappings = Array.isArray(nextState?.mappings)
      ? nextState.mappings
          .map((item: any, index: number) => this.normalizeMapping(item, index))
          .filter(Boolean)
      : [];
    const sanitizedConfigs = Array.isArray(nextState?.imageConfigs)
      ? nextState.imageConfigs
          .map((item: any, index: number) => this.normalizeImageConfig(item, index))
          .filter(Boolean)
      : [];

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

    try {
      const rawDict = nextState?.dictionaries;
      const sanitizedDictionaries = {
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
      const sanitizedAgent = this.normalizeAgentConfig(nextState?.agentConfig);
      
      const state = {
        mappings: sanitizedMappings as ModelMapping[],
        imageConfigs: sanitizedConfigs as ImageConfig[],
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
      return this.getDefaultState();
    }
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
