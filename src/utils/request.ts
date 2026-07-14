import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { decryptData, encryptData, isClientApiCryptoEnabled } from "./cipher";
import { userFacingError } from "./userFacingError";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const request: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

function shouldBypassTunnel(config: InternalAxiosRequestConfig): boolean {
  const url = String(config.url || "");
  const path = url.startsWith("http")
    ? new URL(url).pathname
    : url.split("?")[0];
  // Multipart / binary uploads
  if (config.data instanceof FormData) return true;
  // SSE & long streams
  if (path.includes("/stream")) return true;
  // Public files
  if (path.startsWith("/files/")) return true;
  // Webhooks never from browser
  if (path.startsWith("/billing/webhooks/")) return true;
  // Already the tunnel
  if (path === "/api/rpc" || path.endsWith("/api/rpc")) return true;
  return false;
}

function resolvePathAndQuery(config: InternalAxiosRequestConfig): {
  path: string;
  query: Record<string, unknown>;
} {
  const raw = String(config.url || "/");
  let path = raw;
  const query: Record<string, unknown> = {};

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
      const params = new URLSearchParams(raw.slice(qIndex + 1));
      params.forEach((v, k) => {
        query[k] = v;
      });
    }
  }

  // Merge axios params
  const params = config.params as Record<string, unknown> | undefined;
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) query[k] = v;
    }
  }

  if (!path.startsWith("/")) path = `/${path}`;
  return { path, query };
}

request.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem("omnicanvas_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const method = String(config.method || "get").toLowerCase();
    if (
      ["post", "put", "patch", "delete"].includes(method) &&
      !config.headers["Idempotency-Key"]
    ) {
      config.headers["Idempotency-Key"] = crypto.randomUUID();
    }

    const cryptoOn = isClientApiCryptoEnabled();
    if (!cryptoOn) return config;

    // Always mark crypto so server encrypts responses
    config.headers["X-API-Crypto"] = "true";

    if (shouldBypassTunnel(config)) {
      // Still encrypt JSON bodies on bypass paths when present
      if (config.data && !(config.data instanceof FormData) && typeof config.data === "object") {
        try {
          const encrypted = await encryptData(JSON.stringify(config.data));
          config.data = { encrypted };
        } catch (err) {
          console.error("Failed to encrypt request data:", err);
        }
      }
      return config;
    }

    // Full RPC tunnel: hide method + path + query + body
    try {
      const { path, query } = resolvePathAndQuery(config);
      const envelope = {
        m: String(config.method || "GET").toUpperCase(),
        p: path,
        q: query,
        b:
          config.data instanceof FormData
            ? undefined
            : config.data ?? undefined,
        t: Date.now(),
        n: crypto.randomUUID().replace(/-/g, ""),
      };
      const encrypted = await encryptData(JSON.stringify(envelope));
      config.method = "post";
      config.url = "/api/rpc";
      config.params = undefined;
      config.data = { encrypted };
      config.headers["Content-Type"] = "application/json";
      config.headers["X-API-Crypto"] = "true";
    } catch (err) {
      console.error("Failed to build encrypted RPC envelope:", err);
    }

    return config;
  },
  (error) => Promise.reject(error),
);

async function maybeDecryptPayload(data: unknown, _headers?: Record<string, unknown>) {
  if (!isClientApiCryptoEnabled()) return data;
  // Decrypt whenever the envelope shape is present — do not rely solely on
  // X-API-Crypto (CORS may hide custom headers if not exposed).
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { encrypted?: unknown }).encrypted === "string" &&
    Object.keys(data as object).length <= 2
  ) {
    const decryptedStr = await decryptData(
      String((data as { encrypted: string }).encrypted),
    );
    return JSON.parse(decryptedStr);
  }
  return data;
}

request.interceptors.response.use(
  async (response) => {
    try {
      response.data = await maybeDecryptPayload(
        response.data,
        response.headers as any,
      );
    } catch (err) {
      console.error("Failed to decrypt response data:", err);
    }
    return response;
  },
  async (error: AxiosError) => {
    if (error.response) {
      try {
        error.response.data = await maybeDecryptPayload(
          error.response.data,
          error.response.headers as any,
        );
      } catch (err) {
        console.error("Failed to decrypt error response data:", err);
      }
    }

    if (error.response?.status === 401) {
      localStorage.removeItem("omnicanvas_token");
      window.dispatchEvent(new CustomEvent("omnicanvas:unauthorized"));
    }
    if (error.response?.status === 402) {
      window.dispatchEvent(
        new CustomEvent("omnicanvas:payment-required", {
          detail: error.response.data,
        }),
      );
    }
    // Attach a safe user-facing message without wiping technical logs
    const safe = userFacingError(error);
    (error as any).userMessage = safe;
    if (error.response?.data && typeof error.response.data === "object") {
      const data = error.response.data as Record<string, unknown>;
      // Prefer sanitized message for UI; keep original under _raw if technical
      if (typeof data.message === "string" && data.message !== safe) {
        data._devMessage = data.message;
        data.message = safe;
      } else if (!data.message) {
        data.message = safe;
      }
    }
    console.error("Request error:", error);
    return Promise.reject(error);
  },
);

export default request;
export { API_BASE_URL };
