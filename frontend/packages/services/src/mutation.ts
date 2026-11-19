import {
  enqueueWrite,
  flushOutbox,
  type MergeRule,
  type NexusOfflineDB,
  type OfflineScope,
  type OutboxEntry,
  type OutboxTransport,
  type SyncPriority,
  type TransportResult,
} from "@nexus/offline";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ApiRequestError, HEADER, type ApiClient } from "./client";
import { useServices } from "./query";

/** Sends one write; must pass `idempotencyKey` as the `Idempotency-Key` header (see `idempotencyHeaders`). */
export type OutboxSend<TVars, TResult> = (
  client: ApiClient,
  vars: TVars,
  idempotencyKey: string,
) => Promise<TResult>;

export interface OutboxMutationOptions<TVars, TResult> {
  readonly moduleId: string;
  readonly operation: string;
  readonly mergeRule: MergeRule;
  readonly priority?: SyncPriority;
  readonly send: OutboxSend<TVars, TResult>;
}

/** Sent now (`data`), or queued in the outbox to replay when back online (L2, O-2). */
export type OutboxMutationResult<TResult> =
  | { readonly queued: false; readonly data: TResult }
  | { readonly queued: true; readonly entryId: string };

export function idempotencyHeaders(idempotencyKey: string): Readonly<Record<string, string>> {
  return { [HEADER.idempotencyKey]: idempotencyKey };
}

type Replay = (payload: unknown, idempotencyKey: string) => Promise<unknown>;
/** Senders of mounted mutation hooks, by `moduleId:operation`; the transport replays through them. */
const senders = new Map<string, Replay>();
const senderKey = (moduleId: string, operation: string) => `${moduleId}:${operation}`;

function toTransportResult(error: unknown): TransportResult {
  if (!(error instanceof ApiRequestError)) {
    return { kind: "retryable", message: error instanceof Error ? error.message : "Send failed" };
  }
  if (error.status === 0 || error.status === 429 || error.status >= 500) {
    return { kind: "retryable", message: error.error.code };
  }
  if (error.status === 409) {
    return { kind: "conflict", message: error.error.code, serverSnapshot: error.error.details };
  }
  return { kind: "fatal", message: error.error.code };
}

/** Replays outbox entries through the registered senders; an unknown operation waits for its screen. */
export const outboxTransport: OutboxTransport = async (entry: OutboxEntry) => {
  const replay = senders.get(senderKey(entry.moduleId, entry.operation));
  if (!replay) return { kind: "retryable", message: "no_sender" };
  try {
    await replay(entry.payload, entry.idempotencyKey);
    return { kind: "ok" };
  } catch (error) {
    return toTransportResult(error);
  }
};

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function flush(db: NexusOfflineDB, scope: OfflineScope): void {
  void flushOutbox(db, scope, outboxTransport).catch(() => undefined);
}

/** A write that goes out now when online and through the outbox when not; replays on `online`. */
export function useOutboxMutation<TVars, TResult>(
  options: OutboxMutationOptions<TVars, TResult>,
): UseMutationResult<OutboxMutationResult<TResult>, Error, TVars> {
  const { client, scope, db } = useServices();
  const sendRef = useRef(options.send);
  sendRef.current = options.send;
  const { moduleId, operation, mergeRule, priority } = options;
  const tenantId = scope?.tenantId ?? null;
  const userId = scope?.userId ?? null;

  useEffect(() => {
    if (tenantId === null || userId === null) return;
    const key = senderKey(moduleId, operation);
    const replay: Replay = (payload, idempotencyKey) =>
      sendRef.current(client, payload as TVars, idempotencyKey);
    senders.set(key, replay);
    const active = { tenantId, userId };
    const onOnline = () => flush(db, active);
    window.addEventListener("online", onOnline);
    if (!isOffline()) onOnline();
    return () => {
      window.removeEventListener("online", onOnline);
      if (senders.get(key) === replay) senders.delete(key);
    };
  }, [client, db, moduleId, operation, tenantId, userId]);

  return useMutation({
    // Offline writes must run (and queue) instead of pausing until the network returns.
    networkMode: "always",
    mutationFn: async (vars: TVars): Promise<OutboxMutationResult<TResult>> => {
      if (!scope) throw new Error("Sign in before writing");
      const idempotencyKey = globalThis.crypto.randomUUID();
      const queue = async () => {
        const entry = await enqueueWrite(db, scope, {
          idempotencyKey,
          moduleId,
          operation,
          mergeRule,
          ...(priority ? { priority } : {}),
          payload: vars,
        });
        return { queued: true, entryId: entry.id } as const;
      };
      if (isOffline()) return queue();
      try {
        return { queued: false, data: await sendRef.current(client, vars, idempotencyKey) };
      } catch (error) {
        if (error instanceof ApiRequestError && error.offline) return queue();
        throw error;
      }
    },
  });
}
