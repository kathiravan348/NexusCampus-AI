import { decryptJson, encryptJson } from "./crypto";
import {
  getOrCreateDeviceId,
  getOrCreateUserKey,
  notifyScopeChanges,
  scopeKeyOf,
  setLastSyncedAt,
  subscribeScopeChanges,
  type NexusOfflineDB,
  type OutboxRecord,
} from "./db";
import {
  PRIORITY_RANK,
  type ConflictResolution,
  type EnqueueWriteInput,
  type FlushSummary,
  type OfflineScope,
  type OutboxEntry,
  type OutboxStatus,
  type OutboxTransport,
  type TransportResult,
} from "./types";

async function decodeRecord<TPayload>(
  key: CryptoKey,
  row: OutboxRecord,
): Promise<OutboxEntry<TPayload>> {
  const payload = await decryptJson<TPayload>(key, row.payload);
  const serverSnapshot = row.serverSnapshot
    ? await decryptJson<unknown>(key, row.serverSnapshot)
    : undefined;
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    tenantId: row.tenantId,
    userId: row.userId,
    deviceId: row.deviceId,
    moduleId: row.moduleId,
    operation: row.operation,
    mergeRule: row.mergeRule,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.lastError !== undefined ? { lastError: row.lastError } : {}),
    ...(serverSnapshot !== undefined ? { serverSnapshot } : {}),
    payload,
  };
}

function compareOutboxOrder(a: OutboxRecord, b: OutboxRecord): number {
  if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
  const cmpTime = a.createdAt.localeCompare(b.createdAt);
  return cmpTime !== 0 ? cmpTime : a.id.localeCompare(b.id);
}

/**
 * Queues an offline write with client id, idempotency key, device id, and encrypted payload (O-2).
 * Calling again with the same `idempotencyKey` in the same scope returns the existing entry.
 */
export async function enqueueWrite<TPayload>(
  db: NexusOfflineDB,
  scope: OfflineScope,
  input: EnqueueWriteInput<TPayload>,
): Promise<OutboxEntry<TPayload>> {
  const scopeKey = scopeKeyOf(scope);
  const idempotencyKey = input.idempotencyKey?.trim() || globalThis.crypto.randomUUID();
  const key = await getOrCreateUserKey(db, scope);

  const existing = await db.outbox
    .where("[scopeKey+idempotencyKey]")
    .equals([scopeKey, idempotencyKey])
    .first();
  if (existing) {
    return decodeRecord<TPayload>(key, existing);
  }

  const now = new Date().toISOString();
  const priority = input.priority ?? "normal";
  const record: OutboxRecord = {
    id: globalThis.crypto.randomUUID(),
    scopeKey,
    idempotencyKey,
    tenantId: scope.tenantId,
    userId: scope.userId,
    deviceId: await getOrCreateDeviceId(db),
    moduleId: input.moduleId,
    operation: input.operation,
    mergeRule: input.mergeRule,
    priority,
    priorityRank: PRIORITY_RANK[priority],
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    payload: await encryptJson(key, input.payload),
  };

  try {
    await db.outbox.add(record);
    notifyScopeChanges(db, scope);
    return decodeRecord<TPayload>(key, record);
  } catch {
    const raced = await db.outbox
      .where("[scopeKey+idempotencyKey]")
      .equals([scopeKey, idempotencyKey])
      .first();
    if (raced) return decodeRecord<TPayload>(key, raced);
    throw new Error("Failed to enqueue offline write");
  }
}

export async function listOutbox(
  db: NexusOfflineDB,
  scope: OfflineScope,
  filter?: { readonly status?: OutboxStatus },
): Promise<OutboxEntry[]> {
  const scopeKey = scopeKeyOf(scope);
  const keyRecord = await db.keys.get(scopeKey);
  if (!keyRecord) return [];

  const rows = filter?.status
    ? await db.outbox.where("[scopeKey+status]").equals([scopeKey, filter.status]).toArray()
    : await db.outbox.where("scopeKey").equals(scopeKey).toArray();

  rows.sort(compareOutboxOrder);
  return Promise.all(rows.map((row) => decodeRecord(keyRecord.key, row)));
}

const activeFlushes = new WeakMap<NexusOfflineDB, Map<string, Promise<FlushSummary>>>();

async function runFlush(
  db: NexusOfflineDB,
  scope: OfflineScope,
  transport: OutboxTransport,
): Promise<FlushSummary> {
  const scopeKey = scopeKeyOf(scope);
  const keyRecord = await db.keys.get(scopeKey);
  if (!keyRecord) return { sent: 0, conflicted: 0, retryable: 0, failed: 0 };

  // Recover any entries left in "syncing" after a previous tab/device crash.
  const stuck = await db.outbox.where("[scopeKey+status]").equals([scopeKey, "syncing"]).toArray();
  if (stuck.length > 0) {
    const recoveredAt = new Date().toISOString();
    await db.outbox.bulkPut(
      stuck.map((row) => ({ ...row, status: "pending" as const, updatedAt: recoveredAt })),
    );
  }

  const pending = await db.outbox
    .where("[scopeKey+status]")
    .equals([scopeKey, "pending"])
    .toArray();
  pending.sort(compareOutboxOrder);

  let sent = 0;
  let conflicted = 0;
  let retryable = 0;
  let failed = 0;

  for (const row of pending) {
    const stillHasKey = await db.keys.get(scopeKey);
    if (!stillHasKey) break;

    const now = new Date().toISOString();
    const syncingRow: OutboxRecord = { ...row, status: "syncing", updatedAt: now };
    await db.outbox.put(syncingRow);
    notifyScopeChanges(db, scope);

    const entry = await decodeRecord(keyRecord.key, syncingRow);
    let result: TransportResult;
    try {
      result = await transport(entry);
    } catch (err) {
      result = {
        kind: "retryable",
        message: err instanceof Error ? err.message : "Transport error",
      };
    }

    // Never resurrect a wiped scope if remoteRevokeWipe ran while transport was in flight (O-3).
    const [keyAfter, rowAfter] = await Promise.all([db.keys.get(scopeKey), db.outbox.get(row.id)]);
    if (!keyAfter || !rowAfter) break;

    // Never resurrect a wiped scope if remoteRevokeWipe ran while transport was in flight (O-3).
    const [keyAfter, rowAfter] = await Promise.all([
      db.keys.get(scopeKey),
      db.outbox.get(row.id),
    ]);
    if (!keyAfter || !rowAfter) break;

    const doneAt = new Date().toISOString();
    if (result.kind === "ok") {
      await db.outbox.delete(row.id);
      await setLastSyncedAt(db, scope, doneAt);
      sent += 1;
    } else if (result.kind === "conflict") {
      const encryptedSnapshot =
        result.serverSnapshot !== undefined
          ? await encryptJson(keyRecord.key, result.serverSnapshot)
          : undefined;
      await db.outbox.put({
        ...syncingRow,
        status: "conflict",
        attempts: row.attempts + 1,
        lastError: result.message,
        updatedAt: doneAt,
        ...(encryptedSnapshot !== undefined ? { serverSnapshot: encryptedSnapshot } : {}),
      });
      conflicted += 1;
    } else if (result.kind === "retryable") {
      await db.outbox.put({
        ...syncingRow,
        status: "pending",
        attempts: row.attempts + 1,
        lastError: result.message,
        updatedAt: doneAt,
      });
      retryable += 1;
    } else {
      await db.outbox.put({
        ...syncingRow,
        status: "failed",
        attempts: row.attempts + 1,
        lastError: result.message,
        updatedAt: doneAt,
      });
      failed += 1;
    }
    notifyScopeChanges(db, scope);
  }

  return { sent, conflicted, retryable, failed };
}

/** Replays pending writes for `scope` in priority then FIFO order, guarded against concurrent flushes. */
export function flushOutbox(
  db: NexusOfflineDB,
  scope: OfflineScope,
  transport: OutboxTransport,
): Promise<FlushSummary> {
  const scopeKey = scopeKeyOf(scope);
  let perScope = activeFlushes.get(db);
  if (!perScope) {
    perScope = new Map();
    activeFlushes.set(db, perScope);
  }
  const inFlight = perScope.get(scopeKey);
  if (inFlight) return inFlight;

  const promise = runFlush(db, scope, transport).finally(() => {
    perScope?.delete(scopeKey);
  });
  perScope.set(scopeKey, promise);
  return promise;
}

export async function resolveConflict<TPayload>(
  db: NexusOfflineDB,
  scope: OfflineScope,
  id: string,
  resolution: ConflictResolution<TPayload>,
): Promise<void> {
  const scopeKey = scopeKeyOf(scope);
  const row = await db.outbox.get(id);
  if (!row || row.scopeKey !== scopeKey || row.status !== "conflict") {
    throw new Error(`No conflict entry found for id "${id}" in this scope`);
  }

  if (resolution === "keep-server") {
    await db.outbox.delete(id);
    notifyScopeChanges(db, scope);
    return;
  }

  const now = new Date().toISOString();
  const nextRecord: OutboxRecord = { ...row, status: "pending", updatedAt: now };
  delete nextRecord.lastError;
  delete nextRecord.serverSnapshot;

  if (resolution !== "retry-local") {
    const key = await getOrCreateUserKey(db, scope);
    nextRecord.payload = await encryptJson(key, resolution.payload);
  }

  await db.outbox.put(nextRecord);
  notifyScopeChanges(db, scope);
}

export function subscribeOutbox(
  db: NexusOfflineDB,
  scope: OfflineScope,
  listener: () => void,
): () => void {
  return subscribeScopeChanges(db, scope, listener);
}
