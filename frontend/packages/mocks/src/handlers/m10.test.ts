import { DeviceSyncSchema, SyncConflictSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, ofTenant } from "../context";
import { mockDb, resetMockDb } from "../db";
import { DEVICE, TENANT, USER } from "../fixtures";
import { server } from "../node";

const BASE = "http://localhost/api/v1";
type As = { tenant: string; user: string };
const LS_ADMIN: As = { tenant: TENANT.littleSteps, user: USER.lsPriya };
const LS_TEACHER: As = { tenant: TENANT.littleSteps, user: USER.lsArjun };

function post(path: string, body: unknown = {}, as: As = LS_ADMIN) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    body: JSON.stringify(body),
  });
}

const device = (id: string) => mockDb.devices.find((d) => d.id === id)!;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("m10 write handlers", () => {
  it("revoke marks the device revoke_pending, moves pending writes to lost, audits; twice → 409", async () => {
    const before = device(DEVICE.lsArjunTablet);
    const audits = ofTenant(mockDb.auditEvents, TENANT.littleSteps).length;
    const res = await post(`/devices/${DEVICE.lsArjunTablet}/revoke`);
    const revoked = DeviceSyncSchema.parse(await res.json());
    expect(revoked.status).toBe("revoke_pending");
    expect(revoked.lostWriteCount).toBe(before.lostWriteCount + before.pendingCount);
    expect(revoked.pendingCount).toBe(0);
    expect(ofTenant(mockDb.auditEvents, TENANT.littleSteps)).toHaveLength(audits + 1);
    expect((await post(`/devices/${DEVICE.lsArjunTablet}/revoke`)).status).toBe(409);
  });

  it("resolving a conflict closes it and decrements the device count; again → 409", async () => {
    const count = device(DEVICE.lsArjunTablet).conflictCount;
    const res = await post("/sync-conflicts/scf-ls-01/resolve", { resolution: "keep_server" });
    const resolved = SyncConflictSchema.parse(await res.json());
    expect(resolved.status).toBe("resolved");
    expect(device(DEVICE.lsArjunTablet).conflictCount).toBe(count - 1);
    expect((await post("/sync-conflicts/scf-ls-01/resolve", { resolution: "merged" })).status).toBe(
      409,
    );
  });

  it("needs a resolution (400) and the wipe permission (403)", async () => {
    expect((await post("/sync-conflicts/scf-ls-01/resolve", {})).status).toBe(400);
    expect((await post(`/devices/${DEVICE.lsOfficePc}/revoke`, {}, LS_TEACHER)).status).toBe(403);
  });
});
