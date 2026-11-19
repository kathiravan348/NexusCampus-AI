import type { EncryptedPayload } from "./types";

const AES_GCM_IV_BYTES = 12;

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto SubtleCrypto is unavailable in this environment");
  }
  return globalThis.crypto;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Generates a per-user, non-extractable 256-bit AES-GCM key for IndexedDB storage (O-3). */
export async function generateUserKey(): Promise<CryptoKey> {
  const cryptoApi = getCrypto();
  return cryptoApi.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypts a JSON-serialisable value with a fresh 96-bit random IV. */
export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const cryptoApi = getCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoded),
  );
  return { iv, ciphertext: new Uint8Array(encrypted) };
}

/** Decrypts a payload previously produced by `encryptJson`. */
export async function decryptJson<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const cryptoApi = getCrypto();
  const decrypted = await cryptoApi.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(payload.iv) },
    key,
    toArrayBuffer(payload.ciphertext),
  );
  const text = new TextDecoder().decode(decrypted);
  return JSON.parse(text) as T;
}
