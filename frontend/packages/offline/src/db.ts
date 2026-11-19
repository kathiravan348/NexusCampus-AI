import Dexie, { type Table } from "dexie";
import { generateUserKey } from "./crypto";
import type {
  EncryptedPayload,
  MergeRule,
  OfflineScope,
  OutboxStatus,
  SyncPriority,
} from "./types";

export interface KeyRecord {
  scopeKey: string;
  tenantId: string;
  userId: string;
  key: CryptoKey;
  createdAt: string;
}

export interface CacheRecord {
  id: string;
  scopeKey: string;
  cacheKey: string;
  tenantId: string;
  userId: string;
  syncedAt: string;
  expiresAt?: string;
  payload: EncryptedPayload;
}

export interface OutboxRecord {
  id: string;
  scopeKey: string;
  idempotencyKey: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  moduleId: string;
  operation: string;
  mergeRule: MergeRule;
  priority: SyncPriority;
  priorityRank: number;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  /** Server error message, encrypted: it may quote record data (never plaintext in IndexedDB). */
  lastError?: EncryptedPayload;
  payload: EncryptedPayload;
  serverSnapshot?: EncryptedPayload;
}

export interface MetaRecord {
  key: string;
  value: string;
}

export class NexusOfflineDB extends Dexie {
  keys!: Table<KeyRecord, string>;
  cache!: Table<CacheRecord, string>;
  outbox!: Table<OutboxRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = "nexus-offline") {
    super(name);
    this.version(1).stores({
      keys: "&scopeKey",
      cache: "&id, scopeKey, &[scopeKey+cacheKey], syncedAt",
      outbox:
        "&id, &[scopeKey+idempotencyKey], scopeKey, [scopeKey+status], [scopeKey+priorityRank+createdAt]",
      meta: "&key",
    });
  }
}

export function createOfflineDb(name = "nexus-offline"): NexusOfflineDB {
  return new NexusOfflineDB(name);
}

export function scopeKeyOf(scope: OfflineScope): string {
  const tenantId = scope.tenantId.trim();
  const userId = scope.userId.trim();
  if (!tenantId || !userId) {
    throw new Error("OfflineScope requires non-empty tenantId and userId");
  }
  return `${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}`;
}

export function lastSyncedMetaKey(scopeKey: string): string {
  return `lastSyncedAt:${scopeKey}`;
}

export async function getOrCreateDeviceId(db: NexusOfflineDB): Promise<string> {
  const existing = await db.meta.get("deviceId");
  if (existing) return existing.value;
  const deviceId = globalThis.crypto.randomUUID();
  try {
    await db.meta.add({ key: "deviceId", value: deviceId });
    return deviceId;
  } catch {
    const raced = await db.meta.get("deviceId");
    if (raced) return raced.value;
    throw new Error("Failed to persist deviceId");
  }
}

export async function getOrCreateUserKey(
  db: NexusOfflineDB,
  scope: OfflineScope,
): Promise<CryptoKey> {
  const scopeKey = scopeKeyOf(scope);
  const existing = await db.keys.get(scopeKey);
  if (existing) return existing.key;

  const key = await generateUserKey();
  const record: KeyRecord = {
    scopeKey,
    tenantId: scope.tenantId,
    userId: scope.userId,
    key,
    createdAt: new Date().toISOString(),
  };
  try {
    await db.keys.add(record);
    return key;
  } catch {
    const raced = await db.keys.get(scopeKey);
    if (raced) return raced.key;
    throw new Error("Failed to persist user encryption key");
  }
}

export async function getLastSyncedAt(
  db: NexusOfflineDB,
  scope: OfflineScope,
): Promise<string | null> {
  const row = await db.meta.get(lastSyncedMetaKey(scopeKeyOf(scope)));
  return row ? row.value : null;
}

export async function setLastSyncedAt(
  db: NexusOfflineDB,
  scope: OfflineScope,
  iso: string,
): Promise<void> {
  await db.meta.put({ key: lastSyncedMetaKey(scopeKeyOf(scope)), value: iso });
}

type Listener = () => void;
const dbListeners = new WeakMap<NexusOfflineDB, Map<string, Set<Listener>>>();

export function subscribeScopeChanges(
  db: NexusOfflineDB,
  scope: OfflineScope,
  listener: Listener,
): () => void {
  const scopeKey = scopeKeyOf(scope);
  let perScope = dbListeners.get(db);
  if (!perScope) {
    perScope = new Map();
    dbListeners.set(db, perScope);
  }
  let set = perScope.get(scopeKey);
  if (!set) {
    set = new Set();
    perScope.set(scopeKey, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) perScope?.delete(scopeKey);
  };
}

export function notifyScopeChanges(db: NexusOfflineDB, scope: OfflineScope): void {
  const set = dbListeners.get(db)?.get(scopeKeyOf(scope));
  if (!set) return;
  for (const listener of set) listener();
}

export function notifyAllScopes(db: NexusOfflineDB): void {
  const perScope = dbListeners.get(db);
  if (!perScope) return;
  for (const set of perScope.values()) {
    for (const listener of set) listener();
  }
}
