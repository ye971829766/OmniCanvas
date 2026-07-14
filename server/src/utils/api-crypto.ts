import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Shared AES-256-GCM helpers for API envelope crypto.
 *
 * IMPORTANT (honest security model):
 * - A secret that also lives in the browser bundle CANNOT hide APIs from a determined reverse engineer.
 * - This layer raises the cost of casual sniffing / script kiddies and hides body + route intent in transit
 *   when used with the /api/rpc tunnel. Real protection still relies on HTTPS, authz, rate limits, and audits.
 */

function resolvePassphrase(): string {
  const fromEnv =
    process.env.API_CRYPTO_SECRET ||
    process.env.API_CRYPTO_KEY ||
    process.env.VITE_API_CRYPTO_SECRET;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  // Dev fallback only — production must set API_CRYPTO_SECRET
  return "omnicanvas_secure_api_key_2026";
}

function getKey(): Buffer {
  return createHash("sha256").update(resolvePassphrase()).digest();
}

export function isApiCryptoEnabled(): boolean {
  return String(process.env.API_CRYPTO || "").toLowerCase() === "true";
}

/** When crypto is on, reject direct semantic routes unless allowlisted (webhooks, static, rpc). */
export function isApiCryptoStrict(): boolean {
  if (!isApiCryptoEnabled()) return false;
  const raw = process.env.API_CRYPTO_STRICT;
  if (raw === undefined || raw === "") return true;
  return String(raw).toLowerCase() !== "false";
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output: Base64(IV 12 + ciphertext + authTag 16)
 */
export function encryptData(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

/**
 * Decrypts AES-256-GCM Base64 string.
 */
export function decryptData(ciphertextBase64: string): string {
  const combined = Buffer.from(ciphertextBase64, "base64");
  if (combined.length < 28) {
    throw new Error("Invalid ciphertext: combined data too short");
  }
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export type RpcEnvelope = {
  /** HTTP method */
  m: string;
  /** Absolute path starting with / */
  p: string;
  /** Query object */
  q?: Record<string, unknown>;
  /** JSON body */
  b?: unknown;
  /** Unix ms timestamp */
  t: number;
  /** One-time nonce */
  n: string;
};

const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const seenNonces = new Map<string, number>();

function pruneNonces(now: number) {
  if (seenNonces.size < 2000) return;
  for (const [n, exp] of seenNonces) {
    if (exp < now) seenNonces.delete(n);
  }
}

export function parseAndValidateEnvelope(encrypted: string): RpcEnvelope {
  const raw = decryptData(encrypted);
  const envelope = JSON.parse(raw) as RpcEnvelope;
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Invalid envelope");
  }
  const method = String(envelope.m || "").toUpperCase();
  const path = String(envelope.p || "");
  if (!method || !path.startsWith("/")) {
    throw new Error("Invalid envelope path/method");
  }
  // Block path traversal / absolute URLs
  if (path.includes("://") || path.includes("..")) {
    throw new Error("Invalid envelope path");
  }
  const t = Number(envelope.t);
  const n = String(envelope.n || "");
  if (!Number.isFinite(t) || !n || n.length < 8) {
    throw new Error("Invalid envelope timestamp/nonce");
  }
  const now = Date.now();
  if (Math.abs(now - t) > REPLAY_WINDOW_MS) {
    throw new Error("Envelope expired");
  }
  pruneNonces(now);
  if (seenNonces.has(n)) {
    throw new Error("Replay detected");
  }
  seenNonces.set(n, now + REPLAY_WINDOW_MS);

  return {
    m: method,
    p: path.split("?")[0],
    q: envelope.q && typeof envelope.q === "object" ? envelope.q : {},
    b: envelope.b,
    t,
    n,
  };
}

/** Paths that remain reachable without the RPC tunnel when strict mode is on. */
export function isCryptoAllowlistedPath(pathname: string): boolean {
  const p = pathname.split("?")[0] || "/";
  if (p === "/api/rpc" || p === "/api/rpc/") return true;
  if (p === "/" || p === "/health" || p === "/api/health") return true;
  // Stripe / payment webhooks must stay plain for third-party callbacks
  if (p.startsWith("/billing/webhooks/")) return true;
  // Public file assets
  if (p.startsWith("/files/")) return true;
  // Multipart upload (binary); still requires auth on controller
  if (p === "/upload" || p.startsWith("/upload/")) return true;
  // SSE / streaming cannot go through encrypted JSON tunnel
  if (p.includes("/stream")) return true;
  // Auth bootstrap: allow plain login/register so misconfigured frontends
  // (e.g. admin without VITE_API_CRYPTO) can still obtain a token, then use RPC.
  // Prefer RPC when client crypto is enabled.
  if (
    p === "/auth/login" ||
    p === "/auth/register" ||
    p === "/auth/google" ||
    p === "/auth/me"
  ) {
    return true;
  }
  return false;
}

export function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
