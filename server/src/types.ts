export type GenerateImageMode = "text-to-image" | "image-to-image";
export type GenerateImageOutputFormat = "png" | "jpeg" | "webp";
export type YunwuImageEndpoint = "generations" | "edits";
export type YunwuApiPurpose = "image" | "chat" | "video";
export type ChatRole = "system" | "user" | "assistant";

export interface GenerateImageJsonRequest {
  prompt?: unknown;
  model?: unknown;
  style?: unknown;
  size?: unknown;
  aspectRatio?: unknown;
  quality?: unknown;
  outputFormat?: unknown;
}

export interface GenerateImageResponse {
  type: "image";
  taskId?: string;
  status?: "generating" | "success" | "error";
  mode?: GenerateImageMode;
  imageUrl?: string;
  url?: string;
  model?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model?: unknown;
  messages?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
}

export interface ChatResponse {
  type: "chat";
  model: string;
  message: ChatMessage | null;
  choices: unknown[];
  usage?: unknown;
}

export interface YunwuModel {
  id: string;
  object?: string;
  ownedBy?: string;
}

export interface YunwuModelsResponse {
  type: YunwuApiPurpose;
  models: YunwuModel[];
}

export interface ImageModelOptionsResponse {
  model: string;
  sizes?: string[];
  qualities: string[];
  defaults: {
    size: string;
    quality?: string;
  };
  aspectRatios?: string[];
  qualityMode?: "quality" | "image_size" | "resolution" | "preset";
  notes?: string[];
  source?: string;
  sourceUrls?: string[];
  maxReferenceImages?: number;
}

export interface VideoModelOptionsResponse {
  model: string;
  sizes: { label: string; value: string }[];
  seconds: { label: string; value: string }[];
  defaults: {
    size: string;
    seconds: string;
  };
  notes?: string[];
  source?: string;
  sourceUrls?: string[];
}

