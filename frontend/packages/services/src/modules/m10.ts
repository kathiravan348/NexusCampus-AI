import {
  ConflictResolutionSchema,
  DeviceSyncSchema,
  PAGE_SIZE_MAX,
  SyncConflictSchema,
  pageSchema,
  type ConflictResolution,
  type DeviceSync,
  type SyncConflict,
} from "@nexus/contracts";
import {
  flushOutbox,
  listOutbox,
  resolveConflict,
  subscribeOutbox,
  type ConflictResolution as LocalResolution,
  type FlushSummary,
  type OutboxEntry,
  type OutboxTransport,
} from "@nexus/offline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { queryKeys } from "../keys";
import { outboxTransport } from "../mutation";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

/* M10 sync centre (L3): server device registry + this device's local outbox (never the payload in UI). */

export const ResolveConflictInputSchema = z.strictObject({ resolution: ConflictResolutionSchema });
const DevicePage = pageSchema(DeviceSyncSchema);
const ConflictPage = pageSchema(SyncConflictSchema);
const all = { pageSize: PAGE_SIZE_MAX };

export function useDevices(enabled = true) {
  return useScopedQuery(
    queryKeys.m10.devices,
    (c, signal) => c.get("/devices", DevicePage, all, { signal }),
    enabled,
  );
}

export function useSyncConflicts(enabled = true) {
  return useScopedQuery(
    queryKeys.m10.conflicts,
    (c, signal) => c.get("/sync-conflicts", ConflictPage, all, { signal }),
    enabled,
  );
}

function useM10Invalidate() {
  const { session } = useSession();
  const qc = useQueryClient();
  return async () => {
    if (session) await qc.invalidateQueries({ queryKey: queryKeys.m10.all(session) });
  };
}

/** Asks for a remote wipe of a device (→ `revoke_pending`); online only. */
export function useRevokeDevice() {
  const { client } = useServices();
  const invalidate = useM10Invalidate();
  return useMutation<DeviceSync, Error, string>({
    mutationFn: (id) =>
      client.send("POST", `/devices/${encodeURIComponent(id)}/revoke`, {}, DeviceSyncSchema),
    onSuccess: invalidate,
  });
}

/** Resolves a server-side conflict; refetches conflicts and device counts. */
export function useResolveConflict() {
  const { client } = useServices();
  const invalidate = useM10Invalidate();
  return useMutation<SyncConflict, Error, { id: string; resolution: ConflictResolution }>({
    mutationFn: ({ id, resolution }) =>
      client.send(
        "POST",
        `/sync-conflicts/${encodeURIComponent(id)}/resolve`,
        { resolution },
        SyncConflictSchema,
      ),
    onSuccess: invalidate,
  });
}

export interface LocalOutbox {
  readonly entries: readonly OutboxEntry[];
  readonly loading: boolean;
}

/** This device's outbox for the signed-in user, updated live as writes are queued or sent (O-2). */
export function useLocalOutbox(): LocalOutbox {
  const { db, scope } = useServices();
  const tenantId = scope?.tenantId ?? null;
  const userId = scope?.userId ?? null;
  const [state, setState] = useState<LocalOutbox>({ entries: [], loading: true });

  useEffect(() => {
    if (tenantId === null || userId === null) {
      setState({ entries: [], loading: false });
      return undefined;
    }
    const active = { tenantId, userId };
    let live = true;
    const load = () =>
      void listOutbox(db, active).then((entries) => {
        if (live) setState({ entries, loading: false });
      });
    load();
    const unsubscribe = subscribeOutbox(db, active, load);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [db, tenantId, userId]);

  return state;
}

/** "Sync now": replays this device's pending writes (default transport = mounted mutation senders). */
export function useSyncNow(transport: OutboxTransport = outboxTransport) {
  const { db, scope } = useServices();
  return useCallback(async (): Promise<FlushSummary | null> => {
    if (!scope) return null;
    return flushOutbox(db, scope, transport);
  }, [db, scope, transport]);
}

/** Resolves a local outbox conflict: keep mine (retry) or keep the server's version (drop mine). */
export function useResolveLocalConflict() {
  const { db, scope } = useServices();
  return useCallback(
    async (id: string, resolution: Extract<LocalResolution, string>) => {
      if (!scope) return;
      await resolveConflict(db, scope, id, resolution);
    },
    [db, scope],
  );
}
