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
    amount *= this.lookupMultiplier(config.qualityMultipliers, params.quality);
    amount *= this.lookupMultiplier(config.sizeMultipliers, params.size);
    amount *= this.lookupMultiplier(config.scaleMultipliers, params.scale);

    if (operation === "image_generation") {
      const count = Math.max(1, this.nonNegativeInteger(params.n ?? 1));
      amount *= count;
    }

    if (operation === "video_generation") {
      const seconds = Math.max(0, Number(params.seconds || 0));
      const included = Math.max(0, Number(config.includedSeconds || 0));
      const extraRate = Math.max(0, Number(config.additionalMicrosPerSecond || 0));
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

  private lookupMultiplier(map: unknown, key: unknown): number {
    if (!map || typeof map !== "object" || key === undefined || key === null) return 1;
    const normalizedKey = String(key).trim().toLowerCase();
    const entry = Object.entries(map as Record<string, unknown>).find(
      ([candidate]) => candidate.trim().toLowerCase() === normalizedKey,
    );
    const value = Number(entry?.[1] ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
}
