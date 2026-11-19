export interface OfflineScope {
  readonly tenantId: string;
  readonly userId: string;
}

export type MergeRule = "lww-audited" | "append-only" | "manual-review-only";

export type SyncPriority = "critical" | "high" | "normal" | "low";

export const PRIORITY_RANK: Readonly<Record<SyncPriority, number>> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type OutboxStatus = "pending" | "syncing" | "conflict" | "failed";

export interface EncryptedPayload {
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

export interface OutboxEntry<TPayload = unknown> {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly moduleId: string;
  readonly operation: string;
  readonly mergeRule: MergeRule;
  readonly priority: SyncPriority;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError?: string;
  readonly serverSnapshot?: unknown;
  readonly payload: TPayload;
}

export interface EnqueueWriteInput<TPayload = unknown> {
  readonly idempotencyKey?: string;
  readonly moduleId: string;
  readonly operation: string;
  readonly mergeRule: MergeRule;
  readonly priority?: SyncPriority;
  readonly payload: TPayload;
}

export interface CacheEntry<TData = unknown> {
  readonly key: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly syncedAt: string;
  readonly expiresAt?: string;
  readonly expired: boolean;
  readonly data: TData;
}

export interface CacheMeta {
  readonly key: string;
  readonly syncedAt: string;
  readonly expiresAt?: string;
  readonly expired: boolean;
}

export type SyncState = "synced" | "pending" | "syncing" | "conflict" | "offline" | "error";

export interface SyncStatusSnapshot {
  readonly state: SyncState;
  readonly online: boolean;
  readonly pendingCount: number;
  readonly conflictCount: number;
  readonly failedCount: number;
  readonly lastSyncedAt: string | null;
}

export type TransportResult =
  | { readonly kind: "ok" }
  | { readonly kind: "conflict"; readonly serverSnapshot?: unknown; readonly message: string }
  | { readonly kind: "retryable"; readonly message: string }
  | { readonly kind: "fatal"; readonly message: string };

export type OutboxTransport = (entry: OutboxEntry) => Promise<TransportResult>;

export interface FlushSummary {
  readonly sent: number;
  readonly conflicted: number;
  readonly retryable: number;
  readonly failed: number;
}

export type ConflictResolution<TPayload = unknown> =
  "keep-server" | "retry-local" | { readonly kind: "replace"; readonly payload: TPayload };

export interface LostWriteSummary {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly moduleId: string;
  readonly operation: string;
  readonly createdAt: string;
  readonly status: OutboxStatus;
}

export type WipeResult =
  | { readonly wiped: true }
  | {
      readonly wiped: false;
      readonly reason: "unsynced_writes";
      readonly pendingCount: number;
      readonly conflictCount: number;
    };

export interface RemoteRevokeResult {
  readonly wiped: true;
  readonly lostWrites: readonly LostWriteSummary[];
}
