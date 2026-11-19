import { afterEach, describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./crypto";
import {
  createOfflineDb,
  getOrCreateDeviceId,
  getOrCreateUserKey,
  scopeKeyOf,
  type NexusOfflineDB,
} from "./db";

const dbs: NexusOfflineDB[] = [];
function openDb(name: string): NexusOfflineDB {
  const db = createOfflineDb(name);
  dbs.push(db);
  return db;
}

afterEach(async () => {
  while (dbs.length > 0) {
    const db = dbs.pop()!;
    await db.delete();
  }
});

describe("db", () => {
  it("persists a stable deviceId and non-extractable per-user key across DB restarts", async () => {
    const dbName = `nexus-db-restart-${crypto.randomUUID()}`;
    const scope = { tenantId: "t-1", userId: "u-1" };

    const db1 = openDb(dbName);
    const deviceId1 = await getOrCreateDeviceId(db1);
    const key1 = await getOrCreateUserKey(db1, scope);
    const encrypted = await encryptJson(key1, { ok: true });
    db1.close();

    const db2 = openDb(dbName);
    const deviceId2 = await getOrCreateDeviceId(db2);
    const key2 = await getOrCreateUserKey(db2, scope);

    expect(deviceId2).toBe(deviceId1);
    expect(key2.extractable).toBe(false);
    expect(await decryptJson<{ ok: boolean }>(key2, encrypted)).toEqual({ ok: true });
  });

  it("isolates scope keys across users and rejects empty ids", () => {
    expect(scopeKeyOf({ tenantId: "t:1", userId: "u:2" })).not.toBe(
      scopeKeyOf({ tenantId: "t", userId: "1:u:2" }),
    );
    expect(() => scopeKeyOf({ tenantId: "", userId: "u-1" })).toThrow();
    expect(() => scopeKeyOf({ tenantId: "t-1", userId: "   " })).toThrow();
  });
});
