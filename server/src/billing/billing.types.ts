export const CREDIT_MICROS = 1_000_000;

export type BillingOperationType =
  | "llm_chat"
  | "image_generation"
  | "video_generation"
  | "remove_background"
  | "upscale_image"
  | "inpaint_image"
  | "image_edit";

export interface BillingQuoteParams {
  model?: string;
  quality?: string;
  size?: string;
  seconds?: string | number;
  scale?: string | number;
  promptTokens?: number;
  completionTokens?: number;
  [key: string]: unknown;
}

export interface BillingQuote {
  operation: BillingOperationType;
  priceVersionId: string;
  amountMicros: number;
  credits: number;
}

export interface BillingTaskContext {
  operationId: string;
  userId: string;
}

export interface BillingOperationRecord {
  id: string;
  userId: string;
  idempotencyKey: string;
  operation: BillingOperationType;
  status: "reserved" | "captured" | "released";
  quotedMicros: number;
  finalMicros?: number;
  priceVersionId: string;
  requestHash: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
