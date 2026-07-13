export type GenerateImageMode = "text-to-image" | "image-to-image";
export type GenerateImageOutputFormat = "png" | "jpeg" | "webp";
export type YunwuImageEndpoint = "generations" | "edits";
export type YunwuApiPurpose = "image" | "chat" | "video";
export type ChatRole = "system" | "user" | "assistant";

/**
 * JSON body received by POST /generate-image.
 * All fields are optional at the transport layer; runtime validation
 * (required prompt, max reference images, etc.) is performed inside the service.
 */
export interface GenerateImageJsonRequest {
  /** Text prompt sent to the image model. Required. */
  prompt?: string;
  /** Image model id. Falls back to server default when omitted. */
  model?: string;
  /** Optional style instruction appended to the prompt. */
  style?: string;
  /** Requested image size, e.g. "1024x1024", "auto". */
  size?: string;
  /** Optional aspect ratio, e.g. "1:1", "16:9". */
  aspectRatio?: string;
  /** Provider-specific quality value (e.g. "auto", "standard", "hd", "1K", "2K"). */
  quality?: string;
  /** Output file format. Defaults to "png" on the server. */
  outputFormat?: GenerateImageOutputFormat;
  /** Base64 data-URL reference images for image-to-image / edits. */
  images?: string[];
  /** Base64 PNG mask for localized edits. Requires at least one image. */
  mask?: string;
  /** Number of images to generate. */
  n?: number;
}

/**
 * JSON body received by POST /generate-video.
 */
export interface GenerateVideoJsonRequest {
  /** Text prompt sent to the video model. Required. */
  prompt?: string;
  /** Video model id. Falls back to server default when omitted. */
  model?: string;
  /** Video duration in seconds, e.g. "5", "8", "10". */
  seconds?: string;
  /** Aspect ratio size, e.g. "16x9", "9x16", "1x1". */
  size?: string;
  /** Whether to add a watermark. "true" or "false". */
  watermark?: string;
  /** Base64 data-URL image used as input reference for video generation. */
  input_reference?: string;
  /** Base64 data-URL image used as tail frame input reference for video generation. */
  input_tail_reference?: string;
}

export interface GenerateImageResponse {
  type: "image";
  taskId?: string;
  status?: "generating" | "success" | "error";
  mode?: GenerateImageMode;
  imageUrl?: string;
  /** All successfully persisted images. imageUrl/url remain aliases for the first item. */
  images?: GeneratedImageResult[];
  requestedCount?: number;
  successfulCount?: number;
  failedCount?: number;
  partial?: boolean;
  url?: string;
  model?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface GeneratedImageResult {
  imageUrl: string;
  url: string;
  index: number;
}

export interface ChatMessage {
  role: ChatRole;
  content: string | any[];
}

export interface ChatRequest {
  model?: unknown;
  messages?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  response_format?: any;
  responseFormat?: any;
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
  maxGenerationCount?: number;
}

export interface VideoModelOptionsResponse {
  model: string;
  sizes: { label: string; value: string }[];
  minSeconds: number;
  maxSeconds: number;
  defaults: {
    size: string;
    seconds: number;
  };
  notes?: string[];
  source?: string;
  sourceUrls?: string[];
  supportReferenceType?: "none" | "first" | "first_last";
}
