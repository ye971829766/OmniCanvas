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

export async function pingChannel(id: string): Promise<{ success: boolean; latency: number; error?: string }> {
  return testChannelConnection(id);
}

export async function discoverChannelModels(idOrBaseUrl: string, apiKey?: string): Promise<string[]> {
  if (apiKey) {
    const res = await axios.post<{ success: boolean; models: string[]; error?: string }>(
      `${API_BASE_URL}/channels/discover-models`,
      { baseUrl: idOrBaseUrl, apiKey }
    );
    return res.data.models || [];
  }
  const res = await axios.get<{ success: boolean; models: string[]; error?: string }>(
    `${API_BASE_URL}/channels/${idOrBaseUrl}/discover-models`
  );
  return res.data.models || [];
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

// --- Admin User Management APIs ---
export interface AdminUser {
  id: string;
  username: string;
  nickname?: string;
  avatarUrl?: string;
  role: "user" | "admin";
  createdAt: string;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await axios.get<AdminUser[]>(`${API_BASE_URL}/admin/users`);
  return res.data;
}

export async function createAdminUser(payload: {
  username: string;
  nickname?: string;
  password: string;
  role?: string;
}): Promise<AdminUser> {
  const res = await axios.post<AdminUser>(`${API_BASE_URL}/admin/users`, payload);
  return res.data;
}

export async function updateAdminUser(
  id: string,
  payload: { nickname?: string; role?: string; password?: string }
): Promise<AdminUser> {
  const res = await axios.put<AdminUser>(`${API_BASE_URL}/admin/users/${id}`, payload);
  return res.data;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await axios.delete(`${API_BASE_URL}/admin/users/${id}`);
}

// --- Admin Token Statistics APIs ---
export interface UserTokenStat {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
  lastUsedAt?: string;
}

export interface SystemTokenStats {
  total: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalRequests: number;
    activeUsersCount: number;
  };
  users: UserTokenStat[];
}

export async function getTokenStats(): Promise<SystemTokenStats> {
  const res = await axios.get<SystemTokenStats>(`${API_BASE_URL}/admin/token-stats`);
  return res.data;
}

