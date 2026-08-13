import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import {
  CREDIT_MICROS,
  type BillingOperationType,
  type BillingQuote,
  type BillingQuoteParams,
} from "./billing.types";

@Injectable()
export class PricingService {
  constructor(private readonly dbService: DatabaseService) {}

  quote(
    operation: BillingOperationType,
    params: BillingQuoteParams = {},
    requestedVersionId?: string,
  ): BillingQuote {
    const db = this.dbService.db;
    const version = requestedVersionId
      ? db.query("SELECT id FROM billing_price_versions WHERE id = ?").get(requestedVersionId) as { id: string } | null
      : db.query(`
          SELECT id FROM billing_price_versions
          WHERE status = 'active'
          ORDER BY publishedAt DESC, createdAt DESC
          LIMIT 1
        `).get() as { id: string } | null;
    if (!version) throw new InternalServerErrorException("No active billing price version");

    const model = typeof params.model === "string" ? params.model.trim() : "";
    const rule = db.query(`
      SELECT * FROM billing_price_rules
      WHERE versionId = $versionId AND operation = $operation
        AND (model = $model OR model IS NULL)
      ORDER BY CASE WHEN model = $model THEN 1 ELSE 0 END DESC, priority DESC
      LIMIT 1
    `).get({
      $versionId: version.id,
      $operation: operation,
      $model: model,
    }) as any;
    if (!rule) throw new InternalServerErrorException(`No billing rule for ${operation}`);

    let amount = Number(rule.baseMicros || 0);
    const promptTokens = this.nonNegativeInteger(params.promptTokens);
    const completionTokens = this.nonNegativeInteger(params.completionTokens);
    amount += Math.ceil(
      (promptTokens * Number(rule.inputMicrosPerMillionTokens || 0)) / 1_000_000,
    );
    amount += Math.ceil(
      (completionTokens * Number(rule.outputMicrosPerMillionTokens || 0)) / 1_000_000,
    );

    const config = this.parseConfig(rule.config);
    const qualityKey = this.normalizeSpecKey(params.quality);
    const qualityIsResolution = this.isResolutionKey(qualityKey);
    if (qualityIsResolution) {
      amount = this.applyMultiplier(
        amount,
        this.resolveResolutionMultiplier(
          config.qualityMultipliers,
          config.sizeMultipliers,
          params.quality,
        ),
      );
    } else {
      amount = this.applyMultiplier(amount, this.lookupMultiplier(config.qualityMultipliers, params.quality));
      amount = this.applyMultiplier(amount, this.resolveSizeMultiplier(config.sizeMultipliers, params.size));
    }
    amount = this.applyMultiplier(amount, this.lookupMultiplier(config.scaleMultipliers, params.scale));

    if (operation === "image_generation" || operation === "image_edit") {
      const count = Math.max(1, this.nonNegativeInteger(params.n ?? 1));
      amount = this.applyMultiplier(amount, count);
    }

    if (operation === "video_generation") {
      const included = Math.max(0, Number(config.includedSeconds || 0));
      const extraRate = Math.max(0, Number(config.additionalMicrosPerSecond || 0));
      const parsedSeconds = Number(params.seconds);
      const seconds = Number.isFinite(parsedSeconds) && parsedSeconds > 0 ? parsedSeconds : included;
      if (seconds > included) amount += Math.ceil((seconds - included) * extraRate);
    }

    const amountMicros = Math.max(0, Math.ceil(amount));
    return {
      operation,
      priceVersionId: version.id,
      amountMicros,
      credits: amountMicros / CREDIT_MICROS,
    };
  }

  private nonNegativeInteger(value: unknown): number {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? Math.max(0, Math.ceil(numeric)) : 0;
  }

  private parseConfig(value: unknown): Record<string, any> {
    try {
      return value ? JSON.parse(String(value)) : {};
    } catch {
      return {};
    }
  }

  private applyMultiplier(amount: number, multiplier: number): number {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const factor = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    if (factor === 1) return amount;
    return Math.ceil(amount * factor);
  }

  private normalizeSpecKey(value: unknown): string {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[×✕*]/g, "x")
      .replace(/\s+/g, "");
  }

  private lookupMultiplier(map: unknown, key: unknown): number {
    const matched = this.findMultiplier(map, key);
    return matched ?? 1;
  }

  private findMultiplier(map: unknown, key: unknown): number | null {
    if (!map || typeof map !== "object" || key === undefined || key === null) return null;
    const normalizedKey = this.normalizeSpecKey(key);
    if (!normalizedKey) return null;
    const aliases = this.keyAliases(normalizedKey);
    const entry = Object.entries(map as Record<string, unknown>).find(([candidate]) =>
      aliases.has(this.normalizeSpecKey(candidate)),
    );
    if (!entry) return null;
    const value = Number(entry[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private keyAliases(normalizedKey: string): Set<string> {
    const aliases = new Set<string>([normalizedKey]);
    const compact = normalizedKey.replace(/-/g, "");
    aliases.add(compact);
    const pixels = this.parsePixelSize(normalizedKey);
    if (pixels) {
      aliases.add(`${pixels.width}x${pixels.height}`);
      aliases.add(`${pixels.height}x${pixels.width}`);
    }
    const resolution = this.resolutionAlias(normalizedKey, pixels);
    if (resolution) aliases.add(resolution);
    return aliases;
  }

  private resolutionAlias(
    normalizedKey: string,
    pixels?: { width: number; height: number },
  ): string | null {
    if (/^(1k|2k|4k)$/.test(normalizedKey)) return normalizedKey;
    if (!pixels) return null;
    const longest = Math.max(pixels.width, pixels.height);
    if (longest <= 1280) return "1k";
    if (longest <= 2560) return "2k";
    return "4k";
  }

  private parsePixelSize(value: unknown): { width: number; height: number } | undefined {
    const match = this.normalizeSpecKey(value).match(/^(\d{2,5})x(\d{2,5})$/);
    if (!match) return undefined;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return undefined;
    }
    return { width, height };
  }

  private isResolutionKey(normalizedKey: string): boolean {
    return /^(1k|2k|4k)$/.test(normalizedKey) || Boolean(this.parsePixelSize(normalizedKey));
  }

  private resolveResolutionMultiplier(
    qualityMap: unknown,
    sizeMap: unknown,
    quality: unknown,
  ): number {
    return this.findMultiplier(qualityMap, quality)
      ?? this.findMultiplier(sizeMap, quality)
      ?? this.resolveSizeMultiplier(sizeMap, quality);
  }

  private resolveSizeMultiplier(map: unknown, size: unknown): number {
    const direct = this.findMultiplier(map, size);
    if (direct != null) return direct;

    const pixels = this.parsePixelSize(size);
    const bucket = this.resolutionAlias(this.normalizeSpecKey(size), pixels);
    if (bucket) {
      const fromBucket = this.findMultiplier(map, bucket);
      if (fromBucket != null) return fromBucket;
    }

    if (!pixels || !map || typeof map !== "object") return 1;
    const longest = Math.max(pixels.width, pixels.height);
    if (longest <= 1280) return this.findMultiplier(map, "1k") ?? 1;
    if (longest <= 2560) return this.findMultiplier(map, "2k") ?? this.findMultiplier(map, "2048x2048") ?? 2;
    return this.findMultiplier(map, "4k") ?? this.findMultiplier(map, "4096x4096") ?? 4;
  }
}
