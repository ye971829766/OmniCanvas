/**
 * Baidu AI open platform — image process helpers.
 * Docs: https://cloud.baidu.com/doc/IMAGEPROCESS/s/ok3bclnkg
 * Auth: https://ai.baidu.com/ai-doc/REFERENCE/Ck3dwjhhu
 */

type TokenCache = {
  accessToken: string;
  /** Epoch ms when the token should be considered expired (with safety margin). */
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

function readBaiduCredentials(): { apiKey: string; secretKey: string } | null {
  const apiKey = (
    process.env.BAIDU_API_KEY ||
    process.env.BAIDU_IMAGE_API_KEY ||
    process.env.BAIDU_AIP_API_KEY ||
    ""
  ).trim();
  const secretKey = (
    process.env.BAIDU_SECRET_KEY ||
    process.env.BAIDU_IMAGE_SECRET_KEY ||
    process.env.BAIDU_AIP_SECRET_KEY ||
    ""
  ).trim();
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey };
}

export function isBaiduUpscaleConfigured(): boolean {
  return Boolean(readBaiduCredentials());
}

/**
 * Fetch (and cache) Baidu access_token. Tokens last ~30 days; we refresh a day early.
 */
export async function getBaiduAccessToken(): Promise<string> {
  const creds = readBaiduCredentials();
  if (!creds) {
    throw new Error(
      "百度云密钥未配置：请设置环境变量 BAIDU_API_KEY 与 BAIDU_SECRET_KEY",
    );
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000) {
    return tokenCache.accessToken;
  }

  const url = new URL("https://aip.baidubce.com/oauth/2.0/token");
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", creds.apiKey);
  url.searchParams.set("client_secret", creds.secretKey);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "",
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    const detail =
      data?.error_description || data?.error || `HTTP ${res.status}`;
    throw new Error(`获取百度 access_token 失败: ${detail}`);
  }

  const expiresInSec = Number(data.expires_in) || 30 * 24 * 3600;
  // Refresh one day early
  tokenCache = {
    accessToken: String(data.access_token),
    expiresAtMs: now + Math.max(60, expiresInSec - 86400) * 1000,
  };
  return tokenCache.accessToken;
}

/**
 * Strip data-URL prefix if present; Baidu expects raw base64 only.
 */
export function toRawBase64(imageBase64OrDataUrl: string): string {
  const raw = imageBase64OrDataUrl.trim();
  const comma = raw.indexOf(",");
  if (raw.startsWith("data:") && comma >= 0) return raw.slice(comma + 1);
  return raw;
}

/**
 * Baidu 图像无损放大 — fixed 2× width & height.
 * Endpoint: POST /rest/2.0/image-process/v1/image_quality_enhance
 * Constraints: image base64 ≤ 4MB, width*height ≤ 2000×2000.
 */
export async function baiduImageQualityEnhance(
  imageBase64OrDataUrl: string,
): Promise<string> {
  const accessToken = await getBaiduAccessToken();
  const image = toRawBase64(imageBase64OrDataUrl);

  // Rough size check (~3/4 of base64 length ≈ bytes)
  const approxBytes = Math.floor((image.length * 3) / 4);
  if (approxBytes > 4 * 1024 * 1024) {
    throw new Error("图片过大：百度无损放大要求 base64 不超过 4MB");
  }

  const endpoint =
    "https://aip.baidubce.com/rest/2.0/image-process/v1/image_quality_enhance" +
    `?access_token=${encodeURIComponent(accessToken)}`;

  const body = new URLSearchParams();
  body.set("image", image);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const data: any = await res.json().catch(() => ({}));
  if (data?.error_code || data?.error_msg || !data?.image) {
    const msg =
      data?.error_msg ||
      data?.error_description ||
      (data?.error_code ? `error_code=${data.error_code}` : `HTTP ${res.status}`);
    throw new Error(`百度无损放大失败: ${msg}`);
  }

  return String(data.image);
}

/**
 * Upscale with Baidu. Each call is 2×; scale=4 runs two passes when possible.
 * Returns raw base64 (no data: prefix).
 */
export async function baiduUpscaleImage(
  imageBase64OrDataUrl: string,
  scale: number = 2,
): Promise<{ base64: string; appliedScale: number }> {
  const target = scale >= 4 ? 4 : 2;
  let current = toRawBase64(imageBase64OrDataUrl);
  let applied = 1;

  // First 2× pass
  current = await baiduImageQualityEnhance(current);
  applied *= 2;

  if (target >= 4) {
    try {
      current = await baiduImageQualityEnhance(current);
      applied *= 2;
    } catch (err: any) {
      // Second pass often fails when intermediate exceeds 2000×2000 product.
      console.warn(
        "[baiduUpscaleImage] 4× second pass failed, keeping 2× result:",
        err?.message || err,
      );
    }
  }

  return { base64: current, appliedScale: applied };
}
