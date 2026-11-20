import { enqueueWrite, listOutbox, scopeKeyOf } from "@nexus/offline";
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";
import { heartbeat, serverDeviceId, storedServerDevice } from "./device";
import { freshDb } from "./test-utils";

const scope = { tenantId: "ten-ls", userId: "usr-ls-priya" };
const device = (status: "active" | "revoke_pending" | "revoked") => ({
  id: "dev_01",
  tenantId: "ten-ls",
  userId: "usr-ls-priya",
  label: "Web browser",
  platform: "web",
  lastSyncAt: null,
  pendingCount: 0,
  conflictCount: 0,
  lostWriteCount: 0,
  status,
  revokedAt: status === "revoked" ? "2026-11-21T10:00:00Z" : null,
});

function backend(answers: Array<[number, unknown]>) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const [status, json] = answers.shift() ?? [500, {}];
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return {
    calls,
    client: new ApiClient({ mode: "real", identity: () => scope, fetch: fakeFetch }),
  };
}

describe("device heartbeat (real mode, NEX-062)", () => {
  it("registers once, then reports unsynced writes", async () => {
    const db = freshDb();
    const { calls, client } = backend([
      [201, device("active")],
      [200, { action: "sync", device: device("active") }],
      [200, { action: "sync", device: device("active") }],
    ]);
    expect(await heartbeat(client, db, scope, vi.fn())).toBe("sync");
    expect(await storedServerDevice(db, scope)).toBe("dev_01");
    expect(serverDeviceId()).toBe("dev_01");
    expect(await heartbeat(client, db, scope, vi.fn())).toBe("sync");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/api/v1/devices",
      "/api/v1/devices/dev_01/heartbeat",
      "/api/v1/devices/dev_01/heartbeat",
    ]);
    expect(calls[1]?.body).toEqual({ pendingCount: 0 });
  });

  it("runs the remote wipe and signs out when the backend answers wipe", async () => {
    const db = freshDb();
    await enqueueWrite(db, scope, {
      moduleId: "M07",
      operation: "preference.save",
      payload: { channels: [] },
      mergeRule: "lww-audited",
      priority: "normal",
    });
    const wiped = vi.fn();
    const { calls, client } = backend([
      [201, device("active")],
      [200, { action: "wipe", device: device("revoked") }],
    ]);
    expect(await heartbeat(client, db, scope, wiped)).toBe("wipe");
    expect(calls[1]?.body).toEqual({ pendingCount: 1 });
    expect(wiped).toHaveBeenCalledTimes(1);
    expect(await listOutbox(db, scope)).toEqual([]);
    expect(await storedServerDevice(db, scope)).toBeNull();
  });

  it("forgets a device the backend no longer knows, to register again", async () => {
    const db = freshDb();
    await db.meta.put({ key: `serverDevice:${scopeKeyOf(scope)}`, value: "dev_gone" });
    const { client } = backend([[404, { error: { code: "not_found", message: "Not found." } }]]);
    expect(await heartbeat(client, db, scope, vi.fn())).toBe("skipped");
    expect(await storedServerDevice(db, scope)).toBeNull();
  });

  it("registers once even when two heartbeats start together", async () => {
    const db = freshDb();
    const { calls, client } = backend([
      [201, device("active")],
      [200, { action: "sync", device: device("active") }],
      [200, { action: "sync", device: device("active") }],
    ]);
    await Promise.all([
      heartbeat(client, db, scope, vi.fn()),
      heartbeat(client, db, scope, vi.fn()),
    ]);
    expect(calls.filter((c) => new URL(c.url).pathname === "/api/v1/devices")).toHaveLength(1);
  });
});
