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
}

export interface ModelConfigState {
  mappings: ModelMapping[];
}

@Injectable()
export class ModelConfigService {
  private DATA_DIR = join(process.cwd(), "data");
  private FILE_PATH = join(this.DATA_DIR, "model-config.json");

  private getDefaultState(): ModelConfigState {
    return { mappings: [] };
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

    return {
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
    };
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
      return { mappings: mappings as ModelMapping[] };
    } catch (err) {
      console.error("Failed to read model-config.json:", err);
      return this.getDefaultState();
    }
  }

  async updateConfig(nextState: any): Promise<ModelConfigState> {
    const sanitized = Array.isArray(nextState?.mappings)
      ? nextState.mappings
          .map((item: any, index: number) => this.normalizeMapping(item, index))
          .filter(Boolean)
      : [];
    const state = { mappings: sanitized as ModelMapping[] };
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
