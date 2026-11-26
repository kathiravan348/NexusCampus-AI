import { DeviceSyncSchema } from "@nexus/contracts";
import {
  getOrCreateDeviceId,
  listOutbox,
  remoteRevokeWipe,
  scopeKeyOf,
  type NexusOfflineDB,
  type OfflineScope,
} from "@nexus/offline";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ApiRequestError, type ApiClient } from "./client";
import { DATA_MODE } from "./config";
import { useMe } from "./modules/m02";
import { useServices } from "./query";
import { useSession } from "./session";

/** Every 5 minutes, on reconnect, and right after this device was revoked (NEX-062, O-3). */
export const HEARTBEAT_MS = 5 * 60_000;
const HEARTBEAT_EVENT = "nexus:heartbeat";

export const HeartbeatResponseSchema = z.strictObject({
  action: z.enum(["sync", "wipe"]),
  device: DeviceSyncSchema,
});

const metaKey = (scope: OfflineScope) => `serverDevice:${scopeKeyOf(scope)}`;

/** Real mode: the id the backend gave this browser for the signed-in user (sent as `X-Device-Id`). */
let currentServerDevice: string | null = null;
export function serverDeviceId(): string | null {
  return currentServerDevice;
}

export async function storedServerDevice(
  db: NexusOfflineDB,
  scope: OfflineScope,
): Promise<string | null> {
  return (await db.meta.get(metaKey(scope)))?.value ?? null;
}

function deviceLabel(now = new Date()): string {
  const nav = globalThis.navigator as
    (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  const platform = nav?.userAgentData?.platform || nav?.platform || "";
  // When it was registered tells two browsers of the same person apart in the device list.
  const stamp = now.toISOString().slice(0, 19).replace("T", " ");
  return `Web browser${platform ? ` (${platform})` : ""}, ${stamp} UTC`.slice(0, 200);
}

/** One registration per user at a time, however many heartbeats start together (StrictMode, several tabs). */
const registering = new Map<string, Promise<string>>();

async function ensureRegistered(
  client: ApiClient,
  db: NexusOfflineDB,
  scope: OfflineScope,
): Promise<string> {
  const stored = await storedServerDevice(db, scope);
  if (stored) return stored;
  const key = metaKey(scope);
  let pending = registering.get(key);
  if (!pending) {
    pending = (async () => {
      const again = await storedServerDevice(db, scope);
      if (again) return again;
      const created = await client.send(
        "POST",
        "/devices",
        { label: deviceLabel(), platform: "web" },
        DeviceSyncSchema,
      );
      await db.meta.put({ key, value: created.id });
      return created.id;
    })().finally(() => registering.delete(key));
    registering.set(key, pending);
  }
  return pending;
}

/** Asks the heartbeat to run now (after revoking this device, so the wipe happens at once). */
export function requestHeartbeat(): void {
  globalThis.dispatchEvent?.(new Event(HEARTBEAT_EVENT));
}

/**
 * One check-in: registers this browser once per user, reports its unsynced writes, and runs the remote wipe when the
 * backend answers `wipe` (local data of this user is destroyed, then the user is signed out). Returns the action.
 */
export async function heartbeat(
  client: ApiClient,
  db: NexusOfflineDB,
  scope: OfflineScope,
  onWiped: () => void,
): Promise<"sync" | "wipe" | "skipped"> {
  const id = await ensureRegistered(client, db, scope);
  currentServerDevice = id;
  const pendingCount = (await listOutbox(db, scope)).length;
  try {
    const answer = await client.send(
      "POST",
      `/devices/${encodeURIComponent(id)}/heartbeat`,
      { pendingCount },
      HeartbeatResponseSchema,
    );
    if (answer.action === "wipe") {
      await remoteRevokeWipe(db, scope);
      await db.meta.delete(metaKey(scope));
      currentServerDevice = null;
      onWiped();
    }
    return answer.action;
  } catch (error) {
    // The registry no longer knows this device (e.g. a reset dev database): register again next time.
    if (error instanceof ApiRequestError && error.status === 404)
      await db.meta.delete(metaKey(scope));
    return "skipped";
  }
}

/** Real mode: keeps this browser's device registration alive while someone is signed in. */
export function useDeviceHeartbeat(intervalMs = HEARTBEAT_MS): void {
  const { client, scope, db } = useServices();
  const { expire } = useSession();
  // Registering a device needs `m10.device.read` (NEX-062); families without it never call (NEX-197 real-data run).
  const me = useMe();
  const allowed = !!me.data?.permissions.includes("m10.device.read");
  useEffect(() => {
    if (DATA_MODE !== "real" || !scope || !allowed) return;
    let running = false;
    const run = () => {
      if (running || globalThis.navigator?.onLine === false) return;
      running = true;
      void heartbeat(client, db, scope, expire)
        .catch(() => "skipped")
        .finally(() => {
          running = false;
        });
    };
    run();
    const timer = setInterval(run, intervalMs);
    globalThis.addEventListener?.("online", run);
    globalThis.addEventListener?.(HEARTBEAT_EVENT, run);
    return () => {
      clearInterval(timer);
      globalThis.removeEventListener?.("online", run);
      globalThis.removeEventListener?.(HEARTBEAT_EVENT, run);
      currentServerDevice = null;
    };
  }, [client, scope, db, expire, intervalMs, allowed]);
}

/** This browser's id in the device list: the server id in real mode, the local id in mock mode. */
export function useThisDeviceId(): string | null {
  const { db, scope } = useServices();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load =
      DATA_MODE === "real" && scope ? storedServerDevice(db, scope) : getOrCreateDeviceId(db);
    void load.then((value) => {
      if (live) setId(value);
    });
    return () => {
      live = false;
    };
  }, [db, scope]);
  return id;
}
