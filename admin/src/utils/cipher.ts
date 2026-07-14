/**
 * Admin AES-256-GCM helpers — keep in sync with src/utils/cipher.ts
 * Web Crypto subtle requires HTTPS or localhost.
 */

function resolvePassphrase(): string {
  const fromEnv =
    import.meta.env.VITE_API_CRYPTO_SECRET ||
    import.meta.env.VITE_API_CRYPTO_KEY;
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  return "omnicanvas_secure_api_key_2026";
}

export function isWebCryptoSubtleAvailable(): boolean {
  try {
    const c = globalThis.crypto as Crypto | undefined;
    return Boolean(c && c.subtle && typeof c.subtle.digest === "function");
  } catch {
    return false;
  }
}

let warnedInsecureCrypto = false;

export function isClientApiCryptoEnabled(): boolean {
  const flag = String(import.meta.env.VITE_API_CRYPTO || "").toLowerCase() === "true";
  if (!flag) return false;
  if (!isWebCryptoSubtleAvailable()) {
    if (!warnedInsecureCrypto && typeof console !== "undefined") {
      warnedInsecureCrypto = true;
      console.warn(
        "[API Crypto] 非 HTTPS 页面已自动关闭加密。请使用 HTTPS 或 VITE_API_CRYPTO=false 重新构建。",
      );
    }
    return false;
  }
  return true;
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (!isWebCryptoSubtleAvailable()) {
    throw new Error("Web Crypto subtle API unavailable (use HTTPS)");
  }
  const enc = new TextEncoder();
  const keyData = enc.encode(resolvePassphrase());
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptData(plaintext: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64(combined);
}

export async function decryptData(ciphertextBase64: string): Promise<string> {
  const key = await getCryptoKey();
  const combined = base64ToBytes(ciphertextBase64);
  if (combined.length < 28) throw new Error("Invalid ciphertext");
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data,
  );
  return new TextDecoder().decode(decrypted);
}
