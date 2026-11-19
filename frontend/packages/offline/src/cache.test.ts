import { afterEach, describe, expect, it } from "vitest";
import { deleteCached, getCached, listCacheMeta, setCached } from "./cache";
import { createOfflineDb, type NexusOfflineDB } from "./db";

const dbs: NexusOfflineDB[] = [];
function openDb(name = `nexus-cache-${crypto.randomUUID()}`): NexusOfflineDB {
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

describe("cache", () => {
  it("encrypts cached values at rest and round-trips across a fresh DB handle", async () => {
    const dbName = `nexus-cache-restart-${crypto.randomUUID()}`;
    const scope = { tenantId: "t-riverside", userId: "u-teacher-1" };
    const secret = { learners: [{ id: "l-1", name: "Amina Al-Mansoor" }] };

    const db1 = openDb(dbName);
    await setCached(db1, scope, "attendance:class-5a", secret, {
      syncedAt: "2026-11-19T06:00:00Z",
      expiresAt: "2026-11-19T12:00:00Z",
    });

    const rawRows = await db1.cache.toArray();
    expect(rawRows).toHaveLength(1);
    const rawCipher = Buffer.from(rawRows[0]!.payload.ciphertext).toString("utf-8");
    expect(rawCipher).not.toContain("Amina");
    expect(JSON.stringify(rawRows[0])).not.toContain("Amina");
    db1.close();

    const db2 = openDb(dbName);
    const entry = await getCached<typeof secret>(
      db2,
      scope,
      "attendance:class-5a",
      new Date("2026-11-19T08:00:00Z"),
    );
    expect(entry).toMatchObject({
      key: "attendance:class-5a",
      syncedAt: "2026-11-19T06:00:00Z",
      expired: false,
      data: secret,
    });

    const expiredEntry = await getCached<typeof secret>(
      db2,
      scope,
      "attendance:class-5a",
      new Date("2026-11-19T13:00:00Z"),
    );
    expect(expiredEntry?.expired).toBe(true);
  });

  it("enforces strict cross-user and cross-tenant isolation", async () => {
    const db = openDb();
    const userA = { tenantId: "t-1", userId: "u-a" };
    const userB = { tenantId: "t-1", userId: "u-b" };
    const otherTenant = { tenantId: "t-2", userId: "u-a" };

    await setCached(db, userA, "roster", { count: 24 });

    expect(await getCached(db, userB, "roster")).toBeNull();
    expect(await getCached(db, otherTenant, "roster")).toBeNull();
    expect(await listCacheMeta(db, userA)).toHaveLength(1);
    expect(await listCacheMeta(db, userB)).toHaveLength(0);

    await deleteCached(db, userA, "roster");
    expect(await getCached(db, userA, "roster")).toBeNull();
  });
});
