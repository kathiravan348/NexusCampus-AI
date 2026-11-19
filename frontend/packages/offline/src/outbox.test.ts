import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineDb, getLastSyncedAt, type NexusOfflineDB } from "./db";
import { enqueueWrite, flushOutbox, listOutbox, resolveConflict } from "./outbox";
import type { OutboxEntry } from "./types";
import { remoteRevokeWipe } from "./wipe";

const dbs: NexusOfflineDB[] = [];
function openDb(): NexusOfflineDB {
  const db = createOfflineDb(`nexus-outbox-${crypto.randomUUID()}`);
  dbs.push(db);
  return db;
}

afterEach(async () => {
  while (dbs.length > 0) {
    const db = dbs.pop()!;
    await db.delete();
  }
});

describe("outbox", () => {
  const scope = { tenantId: "t-1", userId: "u-1" };

  it("deduplicates repeated idempotencyKey and encrypts payload in IndexedDB", async () => {
    const db = openDb();
    const first = await enqueueWrite(db, scope, {
      idempotencyKey: "roll-2026-11-19-5a",
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      payload: { learnerName: "Riya Sharma", present: true },
    });
    const second = await enqueueWrite(db, scope, {
      idempotencyKey: "roll-2026-11-19-5a",
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      payload: { learnerName: "Ignored Duplicate", present: false },
    });

    expect(second.id).toBe(first.id);
    expect(second.payload).toEqual({ learnerName: "Riya Sharma", present: true });

    const raw = await db.outbox.toArray();
    expect(raw).toHaveLength(1);
    expect(JSON.stringify(raw[0])).not.toContain("Riya Sharma");
  });

  it("replays writes in priority order (critical -> high -> normal -> low) then FIFO", async () => {
    const db = openDb();
    await enqueueWrite(db, scope, {
      moduleId: "M35",
      operation: "media.upload",
      mergeRule: "append-only",
      priority: "low",
      payload: { tag: "low-1" },
    });
    await enqueueWrite(db, scope, {
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      priority: "high",
      payload: { tag: "high-1" },
    });
    await enqueueWrite(db, scope, {
      moduleId: "M85",
      operation: "emergency.headcount",
      mergeRule: "append-only",
      priority: "critical",
      payload: { tag: "critical-1" },
    });
    await enqueueWrite(db, scope, {
      moduleId: "M17",
      operation: "attendance.note",
      mergeRule: "lww-audited",
      priority: "normal",
      payload: { tag: "normal-1" },
    });

    const order: string[] = [];
    const summary = await flushOutbox(db, scope, async (entry: OutboxEntry) => {
      order.push((entry.payload as { tag: string }).tag);
      return { kind: "ok" };
    });

    expect(order).toEqual(["critical-1", "high-1", "normal-1", "low-1"]);
    expect(summary).toEqual({ sent: 4, conflicted: 0, retryable: 0, failed: 0 });
    expect(await listOutbox(db, scope)).toHaveLength(0);
    expect(await getLastSyncedAt(db, scope)).not.toBeNull();
  });

  it("handles conflict, retryable, fatal, and conflict resolutions", async () => {
    const db = openDb();
    const conflictEntry = await enqueueWrite(db, scope, {
      moduleId: "M18",
      operation: "fee.receipt",
      mergeRule: "manual-review-only",
      priority: "high",
      payload: { amount: 5000 },
    });
    const retryEntry = await enqueueWrite(db, scope, {
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      priority: "normal",
      payload: { present: true },
    });
    const fatalEntry = await enqueueWrite(db, scope, {
      moduleId: "M19",
      operation: "grade.submit",
      mergeRule: "manual-review-only",
      priority: "low",
      payload: { score: 95 },
    });

    const summary = await flushOutbox(db, scope, async (entry) => {
      if (entry.id === conflictEntry.id) {
        return { kind: "conflict", serverSnapshot: { amount: 4500 }, message: "Version mismatch" };
      }
      if (entry.id === retryEntry.id) {
        return { kind: "retryable", message: "503 unavailable" };
      }
      return { kind: "fatal", message: "400 invalid term" };
    });

    expect(summary).toEqual({ sent: 0, conflicted: 1, retryable: 1, failed: 1 });

    const conflicts = await listOutbox(db, scope, { status: "conflict" });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.serverSnapshot).toEqual({ amount: 4500 });
    expect(conflicts[0]?.lastError).toBe("Version mismatch");

    // Raw serverSnapshot is also encrypted at rest
    const rawConflict = await db.outbox.get(conflictEntry.id);
    expect(JSON.stringify(rawConflict)).not.toContain("4500");

    await resolveConflict(db, scope, conflictEntry.id, {
      kind: "replace",
      payload: { amount: 4500 },
    });
    const pending = await listOutbox(db, scope, { status: "pending" });
    expect(pending.find((e) => e.id === conflictEntry.id)?.payload).toEqual({ amount: 4500 });

    const failed = await listOutbox(db, scope, { status: "failed" });
    expect(failed.map((e) => e.id)).toEqual([fatalEntry.id]);

    // Test keep-server deletes a conflict cleanly
    await flushOutbox(db, scope, async () => ({ kind: "conflict", message: "Again" }));
    await resolveConflict(db, scope, conflictEntry.id, "keep-server");
    expect((await listOutbox(db, scope)).some((e) => e.id === conflictEntry.id)).toBe(false);
  });

  it("guards against concurrent flushes on the same scope", async () => {
    const db = openDb();
    await enqueueWrite(db, scope, {
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      payload: { ok: true },
    });

    const transport = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { kind: "ok" as const };
    });

    const [a, b] = await Promise.all([
      flushOutbox(db, scope, transport),
      flushOutbox(db, scope, transport),
    ]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("recovers entries left in syncing state after a crash and never resurrects a revoked scope", async () => {
    const db = openDb();
    const stuck = await enqueueWrite(db, scope, {
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      payload: { recovered: true },
    });
    const raw = await db.outbox.get(stuck.id);
    await db.outbox.put({ ...raw!, status: "syncing" });

    const recovered = await flushOutbox(db, scope, async () => ({ kind: "ok" }));
    expect(recovered.sent).toBe(1);

    // Remote revoke during an in-flight flush must not resurrect the row or lastSyncedAt
    await enqueueWrite(db, scope, {
      moduleId: "M17",
      operation: "attendance.mark",
      mergeRule: "lww-audited",
      payload: { secret: "wiped" },
    });
    await flushOutbox(db, scope, async () => {
      await remoteRevokeWipe(db, scope);
      return { kind: "retryable", message: "network reset" };
    });

    expect(await db.outbox.count()).toBe(0);
    expect(await db.keys.count()).toBe(0);
    expect(await getLastSyncedAt(db, scope)).toBeNull();
  });
});
