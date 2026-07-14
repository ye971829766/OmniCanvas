import axios, { type InternalAxiosRequestConfig } from "axios";
import {
  decryptData,
  encryptData,
  isClientApiCryptoEnabled,
} from "./cipher";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

function shouldBypassTunnel(config: InternalAxiosRequestConfig): boolean {
  const url = String(config.url || "");
  let path = url;
  try {
    path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
  } catch { /* keep */ }
  if (config.data instanceof FormData) return true;
  if (path.includes("/stream")) return true;
  if (path.startsWith("/files/")) return true;
  if (path === "/api/rpc" || path.endsWith("/api/rpc")) return true;
  return false;
}

function resolvePathAndQuery(config: InternalAxiosRequestConfig): {
  path: string;
  query: Record<string, unknown>;
} {
  const raw = String(config.url || "/");
  const query: Record<string, unknown> = {};
  let path = raw;
  try {
    if (raw.startsWith("http")) {
      const u = new URL(raw);
      path = u.pathname;
      u.searchParams.forEach((v, k) => {
        query[k] = v;
      });
    } else {
      const qIndex = raw.indexOf("?");
      if (qIndex >= 0) {
        path = raw.slice(0, qIndex);
        new URLSearchParams(raw.slice(qIndex + 1)).forEach((v, k) => {
          query[k] = v;
        });
      }
    }
  } catch { /* keep */ }
  const params = config.params as Record<string, unknown> | undefined;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) query[k] = v;
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return { path, query };
}

axios.interceptors.request.use(async (config) => {
  const token = localStorage.getItem("omnicanvas_admin_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const method = String(config.method || "get").toLowerCase();
  if (
    ["post", "put", "patch", "delete"].includes(method) &&
    !config.headers["Idempotency-Key"]
  ) {
    config.headers["Idempotency-Key"] = crypto.randomUUID();
  }

  if (!isClientApiCryptoEnabled()) return config;

  config.headers["X-API-Crypto"] = "true";

  if (shouldBypassTunnel(config)) {
    if (config.data && !(config.data instanceof FormData) && typeof config.data === "object") {
      try {
        config.data = { encrypted: await encryptData(JSON.stringify(config.data)) };
      } catch (err) {
        console.error("Admin encrypt failed:", err);
      }
    }
    return config;
  }

  try {
    const { path, query } = resolvePathAndQuery(config);
    const envelope = {
      m: String(config.method || "GET").toUpperCase(),
      p: path,
      q: query,
      b: config.data instanceof FormData ? undefined : config.data ?? undefined,
      t: Date.now(),
      n: crypto.randomUUID().replace(/-/g, ""),
    };
    config.method = "post";
    // Keep absolute base for admin (calls use full URL often)
    config.url = `${API_BASE_URL}/api/rpc`;
    config.baseURL = undefined;
    config.params = undefined;
    config.data = { encrypted: await encryptData(JSON.stringify(envelope)) };
    config.headers["Content-Type"] = "application/json";
  } catch (err) {
    console.error("Admin RPC envelope failed:", err);
  }
  return config;
});

async function maybeDecryptAdminPayload(data: unknown) {
  if (!isClientApiCryptoEnabled()) return data;
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { encrypted?: unknown }).encrypted === "string" &&
    Object.keys(data as object).length <= 2
  ) {
    return JSON.parse(await decryptData(String((data as { encrypted: string }).encrypted)));
  }
  return data;
}

axios.interceptors.response.use(
  async (response) => {
    try {
      response.data = await maybeDecryptAdminPayload(response.data);
    } catch (err) {
      console.error("Admin decrypt failed:", err);
    }
    return response;
  },
  async (error) => {
    if (error.response?.data) {
      try {
        error.response.data = await maybeDecryptAdminPayload(error.response.data);
      } catch { /* ignore */ }
    }
    return Promise.reject(error);
  },
);

export async function loginAdmin(username: string, password: string) {
  const res = await axios.post(`${API_BASE_URL}/auth/login`, {
    username,
    password,
  });
  if (res.data?.user?.role !== "admin") throw new Error("该账号没有管理员权限");
  localStorage.setItem("omnicanvas_admin_token", res.data.token);
  return res.data.user as AdminUser;
}

export async function getAdminMe(): Promise<AdminUser> {
  const res = await axios.get<AdminUser>(`${API_BASE_URL}/auth/me`);
  if (res.data.role !== "admin") throw new Error("该账号没有管理员权限");
  return res.data;
}

export function logoutAdmin() {
  localStorage.removeItem("omnicanvas_admin_token");
}

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

export interface ModelLogoAsset {
  id: string;
  label: string;
  url: string;
  brandInitial?: string;
  brandColor?: string;
}

export interface ModelConfigState {
  mappings: ModelMapping[];
  imageConfigs?: ImageConfig[];
  videoConfigs?: VideoConfig[];
  /** Reusable model logos — pick when creating/editing a mapping */
  logoLibrary?: ModelLogoAsset[];
  dictionaries?: {
    sizes: string[];
    aspectRatios: string[];
    qualities: string[];
    videoSizes?: string[];
  };
  agentConfig?: {
    chatModel: string;
    visionModel?: string;
    /** 局部重绘模型；空字符串表示自动使用第一个启用的图片模型 */
    inpaintModel?: string;
  };
}

export interface TaskResponse {
  type?: string;
  taskId: string;
  status: string;
  url?: string;
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
}

export async function getChannels(): Promise<Channel[]> {
  const res = await axios.get<Channel[]>(`${API_BASE_URL}/channels`);
  return res.data;
}

export async function createChannel(
  payload: Omit<Channel, "id" | "createdAt">,
): Promise<Channel> {
  const res = await axios.post<Channel>(`${API_BASE_URL}/channels`, payload);
  return res.data;
}

export async function updateChannel(
  id: string,
  payload: Partial<Channel>,
): Promise<Channel> {
  const res = await axios.put<Channel>(
    `${API_BASE_URL}/channels/${id}`,
    payload,
  );
  return res.data;
}

export async function deleteChannel(id: string): Promise<void> {
  await axios.delete(`${API_BASE_URL}/channels/${id}`);
}

export async function testChannelConnection(
  id: string,
): Promise<{ success: boolean; latency: number; error?: string }> {
  const res = await axios.post<{
    success: boolean;
    latency: number;
    error?: string;
  }>(`${API_BASE_URL}/channels/${id}/test`);
  return res.data;
}

export async function pingChannel(
  id: string,
): Promise<{ success: boolean; latency: number; error?: string }> {
  return testChannelConnection(id);
}

export async function discoverChannelModels(
  idOrBaseUrl: string,
  apiKey?: string,
): Promise<string[]> {
  if (apiKey) {
    const res = await axios.post<{
      success: boolean;
      models: string[];
      error?: string;
    }>(`${API_BASE_URL}/channels/discover-models`, {
      baseUrl: idOrBaseUrl,
      apiKey,
    });
    return res.data.models || [];
  }
  const res = await axios.get<{
    success: boolean;
    models: string[];
    error?: string;
  }>(`${API_BASE_URL}/channels/${idOrBaseUrl}/discover-models`);
  return res.data.models || [];
}

export async function getAllYunwuModels(
  type: ModelType,
): Promise<YunwuModelsResponse> {
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

export async function testChat(payload: {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
}): Promise<any> {
  const res = await axios.post(`${API_BASE_URL}/chat`, payload);
  return res.data;
}

export async function testGenerateImage(payload: {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  aspectRatio?: string;
}): Promise<any> {
  const res = await axios.post(`${API_BASE_URL}/generate-image`, payload);
  return res.data;
}

export async function testGenerateVideo(payload: {
  model: string;
  prompt: string;
}): Promise<any> {
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
  status?: "active" | "banned";
  banReason?: string | null;
  bannedAt?: string | null;
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
  const res = await axios.post<AdminUser>(
    `${API_BASE_URL}/admin/users`,
    payload,
  );
  return res.data;
}

export async function updateAdminUser(
  id: string,
  payload: { nickname?: string; role?: string; password?: string },
): Promise<AdminUser> {
  const res = await axios.put<AdminUser>(
    `${API_BASE_URL}/admin/users/${id}`,
    payload,
  );
  return res.data;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await axios.delete(`${API_BASE_URL}/admin/users/${id}`);
}

export async function banAdminUser(
  id: string,
  reason?: string,
): Promise<AdminUser> {
  const res = await axios.post<AdminUser>(
    `${API_BASE_URL}/admin/users/${id}/ban`,
    { reason },
  );
  return res.data;
}

export async function unbanAdminUser(id: string): Promise<AdminUser> {
  const res = await axios.post<AdminUser>(
    `${API_BASE_URL}/admin/users/${id}/unban`,
  );
  return res.data;
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
  const res = await axios.get<SystemTokenStats>(
    `${API_BASE_URL}/admin/token-stats`,
  );
  return res.data;
}

// --- Billing Administration APIs ---
export interface BillingOverview {
  accountCount: number;
  availableCredits: number;
  reservedCredits: number;
  lifetimeSpentCredits: number;
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
  paidAmountMinor: number;
  currency: string;
  totalOperations: number;
  reservedOperations: number;
  capturedOperations: number;
  payment: {
    checkoutConfigured: boolean;
    mode: string;
    providers: string[];
    stripe?: {
      secretConfigured: boolean;
      publishableConfigured: boolean;
      webhookConfigured: boolean;
    };
  };
}

export interface BillingAccountAdmin {
  userId: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
  availableCredits: number;
  reservedCredits: number;
  lifetimeGrantedCredits: number;
  lifetimeSpentCredits: number;
  updatedAt: string | null;
}

export interface BillingOrderAdmin {
  id: string;
  userId: string;
  username: string;
  nickname: string;
  sku: string;
  product: { name: string; credits: number };
  amountMinor: number;
  currency: string;
  status: "pending" | "paid" | "closed" | "refunding" | "refunded";
  provider: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface BillingPricingRule {
  id: string;
  versionId?: string;
  operation: string;
  model: string | null;
  baseCredits: number;
  inputCreditsPerMillionTokens: number;
  outputCreditsPerMillionTokens: number;
  priority?: number;
  config: Record<string, unknown>;
}

export type BillingPricingRuleInput = {
  operation?: string;
  model?: string | null;
  baseCredits?: number;
  inputCreditsPerMillionTokens?: number;
  outputCreditsPerMillionTokens?: number;
  priority?: number;
  config?: Record<string, unknown>;
};

export async function getBillingOverview(): Promise<BillingOverview> {
  return (await axios.get(`${API_BASE_URL}/admin/billing/overview`)).data;
}
export async function getBillingAccounts(): Promise<BillingAccountAdmin[]> {
  return (await axios.get(`${API_BASE_URL}/admin/billing/accounts`)).data;
}
export async function getBillingAdminOrders(
  status?: string,
): Promise<{ items: BillingOrderAdmin[]; total: number }> {
  return (
    await axios.get(`${API_BASE_URL}/admin/billing/orders`, {
      params: { status: status || undefined },
    })
  ).data;
}
export async function getBillingPricing(): Promise<{
  version: any;
  rules: BillingPricingRule[];
}> {
  return (await axios.get(`${API_BASE_URL}/admin/billing/pricing`)).data;
}

export interface BillingProductAdmin {
  id: string;
  sku: string;
  name: string;
  credits: number;
  amountMinor: number;
  currency: string;
  status: string;
}

export async function getBillingProducts(): Promise<BillingProductAdmin[]> {
  return (await axios.get(`${API_BASE_URL}/admin/billing/products`)).data;
}
export async function createBillingPricingRule(
  body: BillingPricingRuleInput & { operation: string },
): Promise<BillingPricingRule> {
  return (await axios.post(`${API_BASE_URL}/admin/billing/pricing/rules`, body)).data;
}
export async function updateBillingPricingRule(
  id: string,
  body: BillingPricingRuleInput,
): Promise<BillingPricingRule> {
  return (await axios.put(`${API_BASE_URL}/admin/billing/pricing/rules/${id}`, body)).data;
}
export async function deleteBillingPricingRule(id: string): Promise<{ deleted: boolean; id: string }> {
  return (await axios.delete(`${API_BASE_URL}/admin/billing/pricing/rules/${id}`)).data;
}
export async function adjustUserCredits(
  userId: string,
  amountCredits: number,
  reason: string,
) {
  return (
    await axios.post(
      `${API_BASE_URL}/admin/billing/accounts/${userId}/adjust`,
      { amountCredits, reason },
    )
  ).data;
}
