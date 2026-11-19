import { describe, expect, it } from "vitest";
import { DeviceSyncSchema, MergeRuleSchema, SyncConflictSchema } from "./sync";

const device = {
  id: "dev_01",
  tenantId: "ten_little_steps",
  userId: "usr_teacher_01",
  label: "Classroom tablet 1",
  platform: "android",
  lastSyncAt: "2026-11-18T15:00:00Z",
  pendingCount: 3,
  conflictCount: 1,
  lostWriteCount: 0,
  status: "active",
  revokedAt: null,
};

const conflict = {
  id: "scf_01",
  tenantId: "ten_little_steps",
  deviceId: "dev_01",
  moduleId: "M17",
  operation: "roll.mark",
  mergeRule: "manual-review-only",
  summaryKey: "m10.conflict.markChanged",
  clientVersion: 4,
  serverVersion: 5,
  status: "open",
  resolution: null,
  createdAt: "2026-11-18T15:01:00Z",
  resolvedAt: null,
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("DeviceSync", () => {
  it("accepts active, pending-revoke and revoked devices", () => {
    expect(DeviceSyncSchema.safeParse(device).success).toBe(true);
    expect(DeviceSyncSchema.safeParse({ ...device, status: "revoke_pending" }).success).toBe(true);
    expect(
      DeviceSyncSchema.safeParse({
        ...device,
        status: "revoked",
        revokedAt: "2026-11-19T09:00:00Z",
        lostWriteCount: 2,
        lastSyncAt: null,
      }).success,
    ).toBe(true);
  });

  it("revokedAt is set exactly when revoked; counts are non-negative integers", () => {
    rejects(DeviceSyncSchema, [
      { ...device, status: "revoked" },
      { ...device, revokedAt: "2026-11-19T09:00:00Z" },
      { ...device, pendingCount: -1 },
      { ...device, conflictCount: 0.5 },
      { ...device, platform: "windows" },
      { ...device, label: "" },
      { ...device, payload: {} },
    ]);
  });
});

describe("SyncConflict", () => {
  it("mirrors the offline merge rules", () => {
    expect(MergeRuleSchema.options).toEqual(["lww-audited", "append-only", "manual-review-only"]);
  });

  it("accepts open and resolved conflicts", () => {
    expect(SyncConflictSchema.safeParse(conflict).success).toBe(true);
    expect(
      SyncConflictSchema.safeParse({
        ...conflict,
        status: "resolved",
        resolution: "keep_server",
        resolvedAt: "2026-11-19T08:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("enforces resolution rules and rejects payloads", () => {
    rejects(SyncConflictSchema, [
      { ...conflict, status: "resolved" },
      { ...conflict, status: "resolved", resolution: "merged" },
      { ...conflict, resolution: "merged" },
      { ...conflict, resolvedAt: "2026-11-19T08:00:00Z" },
      {
        ...conflict,
        status: "resolved",
        resolution: "merged",
        resolvedAt: "2026-11-18T15:00:00Z",
      },
      { ...conflict, mergeRule: "lww" },
      { ...conflict, summaryKey: "Mark changed" },
      { ...conflict, operation: "Roll Mark" },
      { ...conflict, clientPayload: { learnerId: "x" } },
    ]);
  });
});
