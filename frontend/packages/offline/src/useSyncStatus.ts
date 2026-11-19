import { useEffect, useState } from "react";
import { getLastSyncedAt, scopeKeyOf, type NexusOfflineDB } from "./db";
import { subscribeOutbox } from "./outbox";
import type { OfflineScope, SyncState, SyncStatusSnapshot } from "./types";

function readOnlineState(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function computeState(
  online: boolean,
  pendingCount: number,
  syncingCount: number,
  conflictCount: number,
  failedCount: number,
): SyncState {
  if (!online) return "offline";
  if (conflictCount > 0) return "conflict";
  if (syncingCount > 0) return "syncing";
  if (failedCount > 0) return "error";
  if (pendingCount > 0) return "pending";
  return "synced";
}

/** Reads the current sync counts and derived state for one scope without decrypting payloads. */
export async function getSyncStatus(
  db: NexusOfflineDB,
  scope: OfflineScope,
  online = readOnlineState(),
): Promise<SyncStatusSnapshot> {
  const scopeKey = scopeKeyOf(scope);
  const [rows, lastSyncedAt] = await Promise.all([
    db.outbox.where("scopeKey").equals(scopeKey).toArray(),
    getLastSyncedAt(db, scope),
  ]);

  let pendingCount = 0;
  let syncingCount = 0;
  let conflictCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    if (row.status === "pending") pendingCount += 1;
    else if (row.status === "syncing") syncingCount += 1;
    else if (row.status === "conflict") conflictCount += 1;
    else if (row.status === "failed") failedCount += 1;
  }

  return {
    state: computeState(online, pendingCount, syncingCount, conflictCount, failedCount),
    online,
    pendingCount: pendingCount + syncingCount,
    conflictCount,
    failedCount,
    lastSyncedAt,
  };
}

function emptySnapshot(online: boolean): SyncStatusSnapshot {
  return {
    state: online ? "synced" : "offline",
    online,
    pendingCount: 0,
    conflictCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
  };
}

/**
 * Reactive sync status hook (O-1): tracks browser online/offline state plus outbox counts
 * (`synced`, `pending`, `syncing`, `conflict`, `offline`, `error`) and `lastSyncedAt`.
 */
export function useSyncStatus(db: NexusOfflineDB, scope: OfflineScope | null): SyncStatusSnapshot {
  const [online, setOnline] = useState<boolean>(readOnlineState);
  const [snapshot, setSnapshot] = useState<SyncStatusSnapshot>(() => emptySnapshot(online));

  const tenantId = scope?.tenantId ?? null;
  const userId = scope?.userId ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (tenantId === null || userId === null) {
      setSnapshot(emptySnapshot(online));
      return;
    }

    const activeScope: OfflineScope = { tenantId, userId };
    let cancelled = false;

    const refresh = () => {
      void getSyncStatus(db, activeScope, online).then((next) => {
        if (!cancelled) setSnapshot(next);
      });
    };

    refresh();
    const unsubscribe = subscribeOutbox(db, activeScope, refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [db, tenantId, userId, online]);

  return snapshot;
}
