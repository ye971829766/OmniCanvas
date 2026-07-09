const PASS_PHRASE = "omnicanvas_secure_api_key_2026";

async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyData = enc.encode(PASS_PHRASE);
  const hash = await crypto.subtle.digest("SHA-256", keyData);
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext using AES-256-GCM
 * Output format: Base64(IV [12 bytes] + Ciphertext + AuthTag [16 bytes])
 */
export async function encryptData(plaintext: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts AES-256-GCM encrypted Base64 string
 */
export async function decryptData(ciphertextBase64: string): Promise<string> {
  const key = await getCryptoKey();
  const combined = new Uint8Array(
    atob(ciphertextBase64)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

  if (combined.length < 28) {
    throw new Error("Invalid ciphertext: combined data too short");
  }

  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  const dec = new TextDecoder();
  return dec.decode(decrypted);
}
