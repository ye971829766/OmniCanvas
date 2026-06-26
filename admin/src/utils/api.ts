import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export interface Channel {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  type: "image" | "chat" | "video" | "all";
  models: string[];
  weight: number;
  status: boolean;
  notes?: string;
  createdAt: string;
}

export type ModelType = "chat" | "image" | "video";

export interface YunwuModel {
  id: string;
  object?: string;
  ownedBy?: string;
}

export interface YunwuModelsResponse {
  type: ModelType;
  models: YunwuModel[];
}

export interface ModelMapping {
  id: string;
  label: string;
  purpose: ModelType;
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
  videoConfigId?: string;
  minSeconds?: number;
  maxSeconds?: number;
  defaultSeconds?: number;
  supportReferenceType?: string;
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

export interface VideoConfig {
  id: string;
  label: string;
  sizes?: string[];
  minSeconds?: number;
  maxSeconds?: number;
  defaultSize?: string;
  defaultSeconds?: number;
  supportReferenceType?: string;
  notes?: string;
}

export interface ModelConfigState {
  mappings: ModelMapping[];
  imageConfigs?: ImageConfig[];
  videoConfigs?: VideoConfig[];
  dictionaries?: {
    sizes: string[];
    aspectRatios: string[];
    qualities: string[];
    videoSizes?: string[];
  };
  agentConfig?: {
    systemPrompt: string;
    chatModel: string;
    visionModel?: string;
  };
}

export async function getChannels(): Promise<Channel[]> {
  const res = await axios.get<Channel[]>(`${API_BASE_URL}/channels`);
  return res.data;
}

export async function createChannel(payload: Omit<Channel, "id" | "createdAt">): Promise<Channel> {
  const res = await axios.post<Channel>(`${API_BASE_URL}/channels`, payload);
  return res.data;
}

export async function updateChannel(id: string, payload: Partial<Channel>): Promise<Channel> {
  const res = await axios.put<Channel>(`${API_BASE_URL}/channels/${id}`, payload);
  return res.data;
}

export async function deleteChannel(id: string): Promise<void> {
  await axios.delete(`${API_BASE_URL}/channels/${id}`);
}

export async function testChannelConnection(id: string): Promise<{ success: boolean; latency: number; error?: string }> {
  const res = await axios.post<{ success: boolean; latency: number; error?: string }>(
    `${API_BASE_URL}/channels/${id}/test`
  );
  return res.data;
}

export async function getAllYunwuModels(type: ModelType): Promise<YunwuModelsResponse> {
  const res = await axios.get<YunwuModelsResponse>(
    `${API_BASE_URL}/models/${type}?scope=all`,
  );
  return res.data;
}

export async function getModelConfig(): Promise<ModelConfigState> {
  const res = await axios.get<ModelConfigState>(`${API_BASE_URL}/model-config`);
  return res.data;
}

export async function updateModelConfig(
  payload: ModelConfigState,
): Promise<ModelConfigState> {
  const res = await axios.put<ModelConfigState>(
    `${API_BASE_URL}/model-config`,
    payload,
  );
  return res.data;
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await axios.post<{ url: string }>(`${API_BASE_URL}/upload`, form);
  return res.data;
}

export interface TaskResponse {
  id: string;
  status: "generating" | "success" | "error";
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export async function discoverChannelModels(id: string): Promise<{ success: boolean; models: string[]; error?: string }> {
  const res = await axios.get<{ success: boolean; models: string[]; error?: string }>(
    `${API_BASE_URL}/channels/${id}/discover-models`
  );
  return res.data;
}

export async function discoverModelsWithCredentials(baseUrl: string, apiKey: string): Promise<{ success: boolean; models: string[]; error?: string }> {
  const res = await axios.post<{ success: boolean; models: string[]; error?: string }>(
    `${API_BASE_URL}/channels/discover-models`,
    { baseUrl, apiKey }
  );
  return res.data;
}

export async function testChat(payload: { model: string; messages: { role: string; content: string }[]; temperature?: number; maxTokens?: number }): Promise<any> {
  const res = await axios.post(`${API_BASE_URL}/chat`, payload);
  return res.data;
}

export async function testGenerateImage(payload: { model: string; prompt: string; size?: string; quality?: string; aspectRatio?: string }): Promise<any> {
  const res = await axios.post(`${API_BASE_URL}/generate-image`, payload);
  return res.data;
}

export async function testGenerateVideo(payload: { model: string; prompt: string }): Promise<any> {
  const res = await axios.post(`${API_BASE_URL}/generate-video`, payload);
  return res.data;
}

export async function pollTaskStatus(taskId: string): Promise<TaskResponse> {
  const res = await axios.get<TaskResponse>(`${API_BASE_URL}/tasks/${taskId}`);
  return res.data;
}

