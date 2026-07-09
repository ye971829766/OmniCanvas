import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PASS_PHRASE = "omnicanvas_secure_api_key_2026";
const KEY = createHash('sha256').update(PASS_PHRASE).digest();

/**
 * Encrypts plaintext using AES-256-GCM (Node crypto)
 * Output matches Web Crypto layout: IV (12 bytes) + Ciphertext + Tag (16 bytes)
 */
export function encryptData(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  const combined = Buffer.concat([
    iv,
    ciphertext,
    authTag
  ]);
  
  return combined.toString('base64');
}

/**
 * Decrypts AES-256-GCM encrypted Base64 string (Node crypto)
 * Expects: IV (12 bytes) + Ciphertext + Tag (16 bytes)
 */
export function decryptData(ciphertextBase64: string): string {
  const combined = Buffer.from(ciphertextBase64, 'base64');
  if (combined.length < 28) {
    throw new Error('Invalid ciphertext: combined data too short');
  }
  
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);
  
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}
