import { decryptJson, encryptJson } from "./crypto";
import { getOrCreateUserKey, scopeKeyOf, type CacheRecord, type NexusOfflineDB } from "./db";
import type { CacheEntry, CacheMeta, OfflineScope } from "./types";

export interface SetCachedOptions {
  readonly syncedAt?: string;
  readonly expiresAt?: string;
}

function isExpired(expiresAt: string | undefined, now: Date): boolean {
  return expiresAt !== undefined && Date.parse(expiresAt) <= now.getTime();
}

function cacheRecordId(scopeKey: string, cacheKey: string): string {
  return `${scopeKey}::${cacheKey}`;
}

/** Encrypts and stores an L1 read-cache value under the caller's tenant+user scope. */
export async function setCached(
  db: NexusOfflineDB,
  scope: OfflineScope,
  cacheKey: string,
  data: unknown,
  options?: SetCachedOptions,
): Promise<CacheMeta> {
  const scopeKey = scopeKeyOf(scope);
  const key = await getOrCreateUserKey(db, scope);
  const payload = await encryptJson(key, data);
  const syncedAt = options?.syncedAt ?? new Date().toISOString();
  const record: CacheRecord = {
    id: cacheRecordId(scopeKey, cacheKey),
    scopeKey,
    cacheKey,
    tenantId: scope.tenantId,
    userId: scope.userId,
    syncedAt,
    ...(options?.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
    payload,
  };
  await db.cache.put(record);
  return {
    key: cacheKey,
    syncedAt,
    ...(options?.expiresAt !== undefined ? { expiresAt: options.expiresAt } : {}),
    expired: isExpired(options?.expiresAt, new Date()),
  };
}

/** Reads and decrypts an L1 cached entry for the caller's scope; returns `null` if absent. */
export async function getCached<T>(
  db: NexusOfflineDB,
  scope: OfflineScope,
  cacheKey: string,
  now = new Date(),
): Promise<CacheEntry<T> | null> {
  const scopeKey = scopeKeyOf(scope);
  const row = await db.cache.get(cacheRecordId(scopeKey, cacheKey));
  if (!row) return null;

  const keyRecord = await db.keys.get(scopeKey);
  if (!keyRecord) return null;

  const data = await decryptJson<T>(keyRecord.key, row.payload);
  return {
    key: row.cacheKey,
    tenantId: row.tenantId,
    userId: row.userId,
    syncedAt: row.syncedAt,
    ...(row.expiresAt !== undefined ? { expiresAt: row.expiresAt } : {}),
    expired: isExpired(row.expiresAt, now),
    data,
  };
}

export async function deleteCached(
  db: NexusOfflineDB,
  scope: OfflineScope,
  cacheKey: string,
): Promise<void> {
  const scopeKey = scopeKeyOf(scope);
  await db.cache.delete(cacheRecordId(scopeKey, cacheKey));
}

export async function listCacheMeta(
  db: NexusOfflineDB,
  scope: OfflineScope,
  now = new Date(),
): Promise<CacheMeta[]> {
  const scopeKey = scopeKeyOf(scope);
  const rows = await db.cache.where("scopeKey").equals(scopeKey).toArray();
  return rows.map((row) => ({
    key: row.cacheKey,
    syncedAt: row.syncedAt,
    ...(row.expiresAt !== undefined ? { expiresAt: row.expiresAt } : {}),
    expired: isExpired(row.expiresAt, now),
  }));
}
