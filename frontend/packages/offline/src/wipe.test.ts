import { afterEach, describe, expect, it, vi } from "vitest";
import { getCached, setCached } from "./cache";
import { createOfflineDb, type NexusOfflineDB } from "./db";
import { enqueueWrite, flushOutbox, listOutbox } from "./outbox";
import { createIdleLock, remoteRevokeWipe, signOutWipe, wipeDevice } from "./wipe";

const dbs: NexusOfflineDB[] = [];
function openDb(): NexusOfflineDB {
  const db = createOfflineDb(`nexus-wipe-${crypto.randomUUID()}`);
  dbs.push(db);
  return db;
}

afterEach(async () => {
  vi.useRealTimers();
  while (dbs.length > 0) {
    const db = dbs.pop()!;
    await db.delete();
  }
});

describe("wipe", () => {
  const userA = { tenantId: "t-1", userId: "u-a" };
  const userB = { tenantId: "t-1", userId: "u-b" };

  it("blocks signOutWipe when pending or conflict writes exist, then wipes once empty", async () => {
    const db = openDb();
    await setCached(db, userA, "profile", { name: "Teacher A" });
    await setCached(db, userB, "profile", { name: "Teacher B" });
    await enqueueWrite(db, userA, {
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      payload: { learner: "Secret Name" },
    });

    const blocked = await signOutWipe(db, userA);
    expect(blocked).toEqual({
      wiped: false,
      reason: "unsynced_writes",
      pendingCount: 1,
      conflictCount: 0,
    });
    expect(await getCached(db, userA, "profile")).not.toBeNull();

    await flushOutbox(db, userA, async () => ({ kind: "ok" }));

    const wiped = await signOutWipe(db, userA);
    expect(wiped).toEqual({ wiped: true });
    expect(await getCached(db, userA, "profile")).toBeNull();
    expect(await db.keys.count()).toBe(1);
    // User B on the same shared device is untouched
    expect((await getCached<{ name: string }>(db, userB, "profile"))?.data).toEqual({
      name: "Teacher B",
    });
  });

  it("wipes immediately on remoteRevokeWipe and reports lost writes with zero PII", async () => {
    const db = openDb();
    await setCached(db, userA, "roster", { learner: "Amina Al-Mansoor" });
    const entry = await enqueueWrite(db, userA, {
      idempotencyKey: "idem-revoke-1",
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      payload: { learnerName: "Amina Al-Mansoor", guardianPhone: "+971500000000" },
    });

    const result = await remoteRevokeWipe(db, userA);
    expect(result.wiped).toBe(true);
    expect(result.lostWrites).toEqual([
      {
        id: entry.id,
        idempotencyKey: "idem-revoke-1",
        moduleId: "M17",
        operation: "attendance.mark",
        createdAt: entry.createdAt,
        status: "pending",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("Amina");
    expect(JSON.stringify(result)).not.toContain("+971500000000");
    expect(await listOutbox(db, userA)).toHaveLength(0);
    expect(await getCached(db, userA, "roster")).toBeNull();
  });

  it("clears all users and metadata on wipeDevice", async () => {
    const db = openDb();
    await setCached(db, userA, "k", { a: 1 });
    await setCached(db, userB, "k", { b: 2 });
    await wipeDevice(db);
    expect(await db.keys.count()).toBe(0);
    expect(await db.cache.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.meta.count()).toBe(0);
  });

  it("locks after idle timeout and unlocks cleanly without losing encrypted DB data", async () => {
    const db = openDb();
    await setCached(db, userA, "roster", { count: 30 });

    vi.useFakeTimers();
    const onLock = vi.fn();
    const idle = createIdleLock({ timeoutMs: 1000, onLock });
    expect(idle.isLocked()).toBe(false);

    vi.advanceTimersByTime(600);
    idle.touch();
    vi.advanceTimersByTime(600);
    expect(idle.isLocked()).toBe(false);

    vi.advanceTimersByTime(400);
    expect(idle.isLocked()).toBe(true);
    expect(onLock).toHaveBeenCalledTimes(1);

    idle.unlock();
    expect(idle.isLocked()).toBe(false);
    idle.dispose();
    vi.useRealTimers();

    expect((await getCached<{ count: number }>(db, userA, "roster"))?.data).toEqual({ count: 30 });
  });
});
