import {
  lastSyncedMetaKey,
  notifyAllScopes,
  notifyScopeChanges,
  scopeKeyOf,
  type NexusOfflineDB,
} from "./db";
import type { LostWriteSummary, OfflineScope, RemoteRevokeResult, WipeResult } from "./types";

async function purgeScope(db: NexusOfflineDB, scopeKey: string): Promise<void> {
  await db.transaction("rw", [db.keys, db.cache, db.outbox, db.meta], async () => {
    await db.keys.delete(scopeKey);
    await db.cache.where("scopeKey").equals(scopeKey).delete();
    await db.outbox.where("scopeKey").equals(scopeKey).delete();
    await db.meta.delete(lastSyncedMetaKey(scopeKey));
  });
}

/**
 * Wipes one user's offline key, cache, and outbox on sign-out (O-3).
 * Refuses if any `pending`, `syncing`, or `conflict` writes remain so nothing is lost (O-2).
 */
export async function signOutWipe(db: NexusOfflineDB, scope: OfflineScope): Promise<WipeResult> {
  const scopeKey = scopeKeyOf(scope);
  // Check and purge in one transaction so a write queued in between is never wiped (O-2).
  const result = await db.transaction(
    "rw",
    [db.keys, db.cache, db.outbox, db.meta],
    async (): Promise<WipeResult> => {
      const rows = await db.outbox.where("scopeKey").equals(scopeKey).toArray();
      let pendingCount = 0;
      let conflictCount = 0;
      for (const row of rows) {
        if (row.status === "pending" || row.status === "syncing") pendingCount += 1;
        else if (row.status === "conflict") conflictCount += 1;
      }
      if (pendingCount > 0 || conflictCount > 0) {
        return { wiped: false, reason: "unsynced_writes", pendingCount, conflictCount };
      }
      await purgeScope(db, scopeKey);
      return { wiped: true };
    },
  );

  if (result.wiped) notifyScopeChanges(db, scope);
  return result;
}

/**
 * Immediately wipes one user's key, cache, and outbox on remote revoke (O-3 / M10).
 * Returns metadata-only summaries (zero PII) of any discarded writes so M10 can report them.
 */
export async function remoteRevokeWipe(
  db: NexusOfflineDB,
  scope: OfflineScope,
): Promise<RemoteRevokeResult> {
  const scopeKey = scopeKeyOf(scope);
  const rows = await db.outbox.where("scopeKey").equals(scopeKey).toArray();
  const lostWrites: LostWriteSummary[] = rows.map((row) => ({
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    moduleId: row.moduleId,
    operation: row.operation,
    createdAt: row.createdAt,
    status: row.status,
  }));

  await purgeScope(db, scopeKey);
  notifyScopeChanges(db, scope);
  return { wiped: true, lostWrites };
}

/** Wipes every user's offline data and device metadata on this browser. */
export async function wipeDevice(db: NexusOfflineDB): Promise<void> {
  await db.transaction("rw", [db.keys, db.cache, db.outbox, db.meta], async () => {
    await db.keys.clear();
    await db.cache.clear();
    await db.outbox.clear();
    await db.meta.clear();
  });
  notifyAllScopes(db);
}

export interface IdleLockOptions {
  readonly timeoutMs: number;
  readonly onLock?: () => void;
}

export interface IdleLockController {
  readonly touch: () => void;
  readonly lock: () => void;
  readonly unlock: () => void;
  readonly isLocked: () => boolean;
  readonly dispose: () => void;
}

/**
 * Shared-device idle lock controller (O-3): locks the active session after inactivity without
 * deleting encrypted IndexedDB data so another user or returning user can unlock safely.
 */
export function createIdleLock(options: IdleLockOptions): IdleLockController {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new RangeError("IdleLock timeoutMs must be a positive number");
  }

  let locked = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const lock = () => {
    clearTimer();
    if (locked || disposed) return;
    locked = true;
    options.onLock?.();
  };

  const armTimer = () => {
    clearTimer();
    if (locked || disposed) return;
    timer = setTimeout(lock, options.timeoutMs);
  };

  const touch = () => {
    if (locked || disposed) return;
    armTimer();
  };

  const unlock = () => {
    if (disposed) return;
    locked = false;
    armTimer();
  };

  const dispose = () => {
    disposed = true;
    clearTimer();
  };

  armTimer();

  return {
    touch,
    lock,
    unlock,
    isLocked: () => locked,
    dispose,
  };
}
