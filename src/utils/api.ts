import request from "./request";

export { API_BASE_URL } from "./request";


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
  imageConfigId?: string;
}

export interface ModelConfigState {
  mappings: ModelMapping[];
  imageConfigs?: any[];
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
  maxGenerationCount?: number;
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
  n?: number;
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
  const res = await request.post<UploadVideoResponse>("/upload-video", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
}

export async function uploadImage(file: File): Promise<UploadImageResponse> {
  const form = new FormData();
  form.append("image", file);
  const res = await request.post<UploadImageResponse>("/upload", form, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
}

export async function generateImage(
  req: GenerateTextToImageRequest,
): Promise<GenerateImageResponse>;
export async function generateImage(
  req: GenerateImageToImageRequest,
): Promise<GenerateImageResponse>;
export async function generateImage(
  req: GenerateImageRequest,
): Promise<GenerateImageResponse> {
  const payload: any = {
    prompt: req.prompt,
    model: req.model,
    style: req.style,
    size: req.size,
    aspectRatio: req.aspectRatio,
    quality: req.quality,
    outputFormat: req.outputFormat,
  };

  if (typeof req.n === "number") {
    payload.n = req.n;
  }

  if ("images" in req && req.images?.length) {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

    payload.images = await Promise.all(req.images.map(toBase64));

    if (req.mask) {
      payload.mask = await toBase64(req.mask);
    }
  }

  const res = await request.post<GenerateImageResponse>("/generate-image", payload);
  return res.data;
}

export async function generateVideo(
  req: {
    prompt: string;
    model: string;
    seconds: string;
    size: string;
    input_reference?: File;
    watermark?: string;
  }
): Promise<any> {
  const payload: any = {
    prompt: req.prompt,
    model: req.model,
    seconds: req.seconds,
    size: req.size,
    watermark: req.watermark || "false",
  };

  if (req.input_reference) {
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });
    payload.input_reference = await toBase64(req.input_reference);
  }

  const res = await request.post<any>("/generate-video", payload);
  return res.data;
}

const modelsCache = new Map<string, Promise<YunwuModelsResponse>>();
const modelOptionsCache = new Map<string, Promise<ImageModelOptionsResponse>>();

export function getYunwuModels(
  type: YunwuModelType,
): Promise<YunwuModelsResponse> {
  let promise = modelsCache.get(type);
  if (!promise) {
    promise = request.get<YunwuModelsResponse>(`/models/${type}`)
      .then((res) => res.data)
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
    promise = request.get<ImageModelOptionsResponse>(`/models/image/${encodeURIComponent(model)}/options`)
      .then((res) => res.data)
      .catch((err) => {
        modelOptionsCache.delete(model);
        throw err;
      });
    modelOptionsCache.set(model, promise);
  }
  return promise;
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const res = await request.post<ChatResponse>("/chat", req);
  return res.data;
}

export async function getTaskStatus(taskId: string): Promise<GenerateImageResponse> {
  const res = await request.get<GenerateImageResponse>(`/tasks/${taskId}`);
  return res.data;
}

export async function getModelConfig(): Promise<ModelConfigState> {
  const res = await request.get<ModelConfigState>("/model-config");
  return res.data;
}

const videoOptionsCache = new Map<string, Promise<VideoModelOptionsResponse>>();

export async function getVideoModelOptions(
  model: string,
): Promise<VideoModelOptionsResponse> {
  let promise = videoOptionsCache.get(model);
  if (!promise) {
    promise = request.get<VideoModelOptionsResponse>(`/models/video/${encodeURIComponent(model)}/options`)
      .then((res) => res.data)
      .catch((err) => {
        videoOptionsCache.delete(model);
        throw err;
      });
    videoOptionsCache.set(model, promise);
  }
  return promise;
}

// ==================== Workspace APIs ====================

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  const res = await request.get<Workspace[]>("/workspaces");
  return res.data;
}

export async function getWorkspaceCanvas(workspaceId: string): Promise<any[]> {
  const res = await request.get<any[]>(`/workspaces/${workspaceId}/canvas`);
  return res.data;
}

export async function updateWorkspaceCanvas(workspaceId: string, canvasData: any[]): Promise<{ success: boolean }> {
  const res = await request.put<{ success: boolean }>(`/workspaces/${workspaceId}/canvas`, canvasData);
  return res.data;
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const res = await request.post<Workspace>("/workspaces", { name });
  return res.data;
}

export async function updateWorkspace(workspaceId: string, name: string): Promise<Workspace> {
  const res = await request.put<Workspace>(`/workspaces/${workspaceId}`, { name });
  return res.data;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await request.delete(`/workspaces/${workspaceId}`);
}

// ==================== Agent APIs ====================

export interface AgentMessage {
  role: string;
  content: string;
  [key: string]: any;
}

export async function getAgentHistory(sessionId: string): Promise<AgentMessage[]> {
  const res = await request.get<AgentMessage[]>(`/agent/${sessionId}/history`);
  return res.data;
}


export async function stopAgent(sessionId: string): Promise<void> {
  await request.post(`/agent/${sessionId}/stop`);
}

export async function deleteAgentSession(sessionId: string): Promise<void> {
  await request.delete(`/agent/${sessionId}`);
}
