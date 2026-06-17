import { Injectable } from "@nestjs/common";
import { join } from "path";
import type { YunwuApiPurpose, YunwuModel } from "../types";

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
}

export interface ModelConfigState {
  mappings: ModelMapping[];
  imageConfigs?: ImageConfig[];
  dictionaries?: {
    sizes: string[];
    aspectRatios: string[];
    qualities: string[];
  };
}

@Injectable()
export class ModelConfigService {
  private DATA_DIR = join(process.cwd(), "data");
  private FILE_PATH = join(this.DATA_DIR, "model-config.json");

  private getDefaultState(): ModelConfigState {
    return {
      mappings: [],
      imageConfigs: [],
      dictionaries: {
        sizes: ["1024x1024", "1536x1024", "2048x2048", "auto", "512", "0.5K", "1K", "2K", "4K"],
        aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        qualities: ["standard", "hd", "low", "medium", "high", "auto", "512", "0.5K", "1K", "2K", "4K"]
      }
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
    return config;
  }

  private async ensureFileExists(): Promise<void> {
    const file = Bun.file(this.FILE_PATH);
    if (!(await file.exists())) {
      await Bun.write(this.FILE_PATH, JSON.stringify(this.getDefaultState(), null, 2));
    }
  }

  async getConfig(): Promise<ModelConfigState> {
    await this.ensureFileExists();
    try {
      const content = await Bun.file(this.FILE_PATH).text();
      const parsed = JSON.parse(content || "{}");
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
      return {
        mappings: mappings as ModelMapping[],
        imageConfigs: imageConfigs as ImageConfig[],
        dictionaries,
      };
    } catch (err) {
      console.error("Failed to read model-config.json:", err);
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
    const state = {
      mappings: sanitizedMappings as ModelMapping[],
      imageConfigs: sanitizedConfigs as ImageConfig[],
      dictionaries: sanitizedDictionaries,
    };
    await this.ensureFileExists();
    await Bun.write(this.FILE_PATH, JSON.stringify(state, null, 2));
    return state;
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
