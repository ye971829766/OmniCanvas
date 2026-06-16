import axios from "axios";

const API_BASE_URL = "http://localhost:3000";

export interface UploadVideoResponse {
  videoUrl: string;
  thumbnailUrl: string;
}

export interface UploadImageResponse {
  type: "image";
  imageUrl: string;
  url: string;
}

export type GenerateImageMode = "text-to-image" | "image-to-image";
export type GenerateImageOutputFormat = "png" | "jpeg" | "webp";
export type YunwuModelType = "image" | "chat" | "video";
export type ChatRole = "system" | "user" | "assistant";

export interface YunwuModel {
  id: string;
  object?: string;
  ownedBy?: string;
}

export interface YunwuModelsResponse {
  type: YunwuModelType;
  models: YunwuModel[];
}

export interface ModelMapping {
  id: string;
  label: string;
  purpose: YunwuModelType;
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

export interface ImageModelOptionsResponse {
  model: string;
  sizes: string[];
  qualities: string[];
  defaults: {
    size: string;
    quality?: string;
  };
  /**
   * Optional aspect-ratio choices for providers that expose ratio controls
   * instead of, or in addition to, concrete width x height presets.
   */
  aspectRatios?: string[];
  /**
   * Describes what the `qualities` values mean for this model family.
   * OpenAI uses rendering quality, Gemini uses image_size, and xAI uses
   * resolution-like 1k/2k choices.
   */
  qualityMode?: "quality" | "image_size" | "resolution" | "preset";
  /**
   * Human-readable caveats for provider-specific compatibility.
   */
  notes?: string[];
  /**
   * Short source label and optional reference URLs used to build the presets.
   */
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

export interface GenerateImageBaseRequest {
  /**
   * Required text prompt sent to the image model.
   */
  prompt: string;
  /**
   * User-selected image model id returned by getYunwuModels("image").
   * Defaults to the server's YUNWU_IMAGE_MODEL when omitted.
   */
  model?: string;
  /**
   * Optional style instruction appended to the prompt on the server.
   */
  style?: string;
  /**
   * Image size requested from Yunwu/OpenAI-compatible image API.
   * Defaults to "1024x1024" on the server.
   */
  size?: string;
  /**
   * Optional aspect ratio.
   */
  aspectRatio?: string;
  /**
   * Provider-specific quality value, forwarded as-is when present.
   */
  quality?: string;
  /**
   * Local file format used when saving the generated image.
   * Defaults to "png" on the server.
   */
  outputFormat?: GenerateImageOutputFormat;
}

export interface GenerateTextToImageRequest extends GenerateImageBaseRequest {
  images?: never;
  mask?: never;
}

export interface GenerateImageToImageRequest extends GenerateImageBaseRequest {
  /**
   * Reference images for image-to-image/edit generation.
   * The server accepts 1-16 PNG, JPEG, or WebP files.
   */
  images: File[];
  /**
   * Optional PNG mask for localized edits. Requires at least one image.
   */
  mask?: File;
}

export type GenerateImageRequest =
  | GenerateTextToImageRequest
  | GenerateImageToImageRequest;

export interface GenerateImageResponse {
  type: "image" | "video";
  taskId?: string;
  status?: "generating" | "success" | "error";
  mode?: GenerateImageMode;
  imageUrl?: string;
  url?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
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
  /**
   * User-selected chat model id returned by getYunwuModels("chat").
   * Defaults to the server's YUNWU_CHAT_MODEL when omitted.
   */
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  type: "chat";
  model: string;
  message: ChatMessage | null;
  choices: unknown[];
  usage?: unknown;
}

/**
 * Uploads a video file to the server.
 * @param file The video file to upload.
 */
export async function uploadVideo(file: File): Promise<UploadVideoResponse> {
  const form = new FormData();
  form.append("video", file);
  const res = await axios.post<UploadVideoResponse>(
    `${API_BASE_URL}/upload-video`,
    form,
  );
  return res.data;
}

export async function uploadImage(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("image", file);
  const res = await axios.post<UploadImageResponse>(
    `${API_BASE_URL}/upload`,
    form,
  );
  return res.data;
}

export async function generateImage(
  request: GenerateTextToImageRequest,
): Promise<GenerateImageResponse>;
export async function generateImage(
  request: GenerateImageToImageRequest,
): Promise<GenerateImageResponse>;
export async function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResponse> {
  const payload: any = {
    prompt: request.prompt,
    model: request.model,
    style: request.style,
    size: request.size,
    aspectRatio: request.aspectRatio,
    quality: request.quality,
    outputFormat: request.outputFormat,
  };

  if ("images" in request && request.images?.length) {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

    payload.images = await Promise.all(request.images.map(toBase64));

    if (request.mask) {
      payload.mask = await toBase64(request.mask);
    }
  }

  const res = await axios.post<GenerateImageResponse>(
    `${API_BASE_URL}/generate-image`,
    payload,
  );
  return res.data;
}

export async function generateVideo(
  request: {
    prompt: string;
    model: string;
    seconds: string;
    size: string;
    input_reference?: File;
    watermark?: string;
  }
): Promise<any> {
  const payload: any = {
    prompt: request.prompt,
    model: request.model,
    seconds: request.seconds,
    size: request.size,
    watermark: request.watermark || "false",
  };

  if (request.input_reference) {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });
    payload.input_reference = await toBase64(request.input_reference);
  }

  const res = await axios.post<any>(
    `${API_BASE_URL}/generate-video`,
    payload,
  );
  return res.data;
}

const modelsCache = new Map<string, Promise<YunwuModelsResponse>>();
const modelOptionsCache = new Map<string, Promise<ImageModelOptionsResponse>>();

export function getYunwuModels(
  type: YunwuModelType,
): Promise<YunwuModelsResponse> {
  let promise = modelsCache.get(type);
  if (!promise) {
    promise = axios.get<YunwuModelsResponse>(
      `${API_BASE_URL}/models/${type}`,
    ).then((res) => res.data)
     .catch((err) => {
       modelsCache.delete(type);
       throw err;
     });
    modelsCache.set(type, promise);
  }
  return promise;
}

export function getImageModelOptions(
  model: string,
): Promise<ImageModelOptionsResponse> {
  let promise = modelOptionsCache.get(model);
  if (!promise) {
    promise = axios.get<ImageModelOptionsResponse>(
      `${API_BASE_URL}/models/image/${encodeURIComponent(model)}/options`,
    ).then((res) => res.data)
     .catch((err) => {
       modelOptionsCache.delete(model);
       throw err;
     });
    modelOptionsCache.set(model, promise);
  }
  return promise;
}

export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const res = await axios.post<ChatResponse>(`${API_BASE_URL}/chat`, request);
  return res.data;
}

export async function getTaskStatus(taskId: string): Promise<GenerateImageResponse> {
  const res = await axios.get<GenerateImageResponse>(
    `${API_BASE_URL}/tasks/${taskId}`,
  );
  return res.data;
}

export async function getModelConfig(): Promise<ModelConfigState> {
  const res = await axios.get<ModelConfigState>(`${API_BASE_URL}/model-config`);
  return res.data;
}

const videoOptionsCache = new Map<string, Promise<VideoModelOptionsResponse>>();

export function getVideoModelOptions(
  model: string,
): Promise<VideoModelOptionsResponse> {
  let promise = videoOptionsCache.get(model);
  if (!promise) {
    promise = axios.get<VideoModelOptionsResponse>(
      `${API_BASE_URL}/models/video/${encodeURIComponent(model)}/options`,
    ).then((res) => res.data)
     .catch((err) => {
       videoOptionsCache.delete(model);
       throw err;
     });
    videoOptionsCache.set(model, promise);
  }
  return promise;
}

