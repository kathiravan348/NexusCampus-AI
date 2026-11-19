import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson, generateUserKey } from "./crypto";

describe("crypto", () => {
  it("generates a non-extractable AES-GCM 256-bit key", async () => {
    const key = await generateUserKey();
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    await expect(globalThis.crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("encrypts and decrypts JSON payloads with unique random IVs", async () => {
    const key = await generateUserKey();
    const secret = { learnerId: "lrn-1", status: "present", note: "Arrived on bus" };

    const first = await encryptJson(key, secret);
    const second = await encryptJson(key, secret);

    expect(first.iv.byteLength).toBe(12);
    expect(Buffer.from(first.iv).equals(Buffer.from(second.iv))).toBe(false);
    expect(Buffer.from(first.ciphertext).toString("utf-8")).not.toContain("Arrived on bus");

    const decoded = await decryptJson<typeof secret>(key, first);
    expect(decoded).toEqual(secret);
  });

  it("rejects decryption with a different user key or tampered ciphertext", async () => {
    const keyA = await generateUserKey();
    const keyB = await generateUserKey();
    const payload = await encryptJson(keyA, { amount: 500 });

    await expect(decryptJson(keyB, payload)).rejects.toThrow();

    const tampered = new Uint8Array(payload.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    await expect(decryptJson(keyA, { iv: payload.iv, ciphertext: tampered })).rejects.toThrow();
  });
});
