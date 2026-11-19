import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  CompliancePackSchema,
  ConsentSchema,
  DataSubjectRequestSchema,
} from "./compliance";

const HASH_A = "a".repeat(64);
const HASH_B = "0123456789abcdef".repeat(4);

const audit = {
  id: "aud_0002",
  tenantId: "ten_apex",
  occurredAt: "2026-11-10T07:15:00Z",
  actorKind: "user",
  actorId: "usr_apex_admin",
  grantId: null,
  action: "m02.user.invited",
  moduleId: "M02",
  targetType: "user",
  targetId: "usr_new",
  deviceId: "dev_01",
  changes: [
    { field: "email", sensitive: false },
    { field: "person.phone", sensitive: true },
  ],
  prevHash: HASH_A,
  hash: HASH_B,
};

const consent = {
  id: "cns_01",
  tenantId: "ten_little_steps",
  personId: "per_child_01",
  purpose: "ai_features",
  status: "granted",
  givenByPersonId: "per_guardian_01",
  method: "digital_signature",
  recordedAt: "2026-06-05T10:00:00Z",
  withdrawnAt: null,
};

const dsr = {
  id: "dsr_01",
  tenantId: "ten_northbridge",
  personId: "per_student_07",
  kind: "export",
  status: "in_progress",
  receivedAt: "2026-11-01T12:00:00Z",
  dueAt: "2026-12-01T12:00:00Z",
  completedAt: null,
  handledBy: "usr_registrar",
};

const pack = {
  code: "dpdp",
  region: "in",
  dsrDueDays: 30,
  minorAgeThreshold: 18,
  guardianConsentForAi: true,
  guardianConsentForMedia: true,
  retentionDaysDefault: 2555,
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("AuditEvent", () => {
  it("accepts user, system, provider-grant and chain-start events", () => {
    expect(AuditEventSchema.safeParse(audit).success).toBe(true);
    expect(AuditEventSchema.safeParse({ ...audit, prevHash: null }).success).toBe(true);
    expect(
      AuditEventSchema.safeParse({ ...audit, actorKind: "system", actorId: null, deviceId: null })
        .success,
    ).toBe(true);
    expect(
      AuditEventSchema.safeParse({
        ...audit,
        actorKind: "provider_grant",
        actorId: "stf_ref_9",
        grantId: "grt_01",
        action: "m02.user.read",
      }).success,
    ).toBe(true);
  });

  it("carries field names only, never values", () => {
    rejects(AuditEventSchema, [
      { ...audit, changes: [{ field: "email", sensitive: false, before: "a@x.test" }] },
      { ...audit, before: {} },
      { ...audit, changes: [{ field: "Email Address", sensitive: false }] },
    ]);
  });

  it("enforces actor, grant, action and hash rules", () => {
    rejects(AuditEventSchema, [
      { ...audit, actorKind: "provider_grant" },
      { ...audit, grantId: "grt_01" },
      { ...audit, actorKind: "system" },
      { ...audit, actorId: null },
      { ...audit, action: "m03.theme.saved" },
      { ...audit, action: "userInvited" },
      { ...audit, hash: "A".repeat(64) },
      { ...audit, hash: "abc" },
      { ...audit, prevHash: "" },
      { ...audit, actorKind: "provider" },
    ]);
  });
});

describe("Consent", () => {
  it("accepts granted, pending and withdrawn consent", () => {
    expect(ConsentSchema.safeParse(consent).success).toBe(true);
    expect(ConsentSchema.safeParse({ ...consent, status: "pending" }).success).toBe(true);
    expect(
      ConsentSchema.safeParse({
        ...consent,
        purpose: "media_sharing",
        status: "withdrawn",
        withdrawnAt: "2026-09-01T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("withdrawnAt is set exactly when withdrawn, never before recording", () => {
    rejects(ConsentSchema, [
      { ...consent, status: "withdrawn" },
      { ...consent, withdrawnAt: "2026-09-01T00:00:00Z" },
      { ...consent, status: "withdrawn", withdrawnAt: "2026-01-01T00:00:00Z" },
      { ...consent, purpose: "research" },
      { ...consent, method: "email" },
      { ...consent, note: "x" },
    ]);
  });
});

describe("DataSubjectRequest", () => {
  it("accepts open and closed requests", () => {
    expect(DataSubjectRequestSchema.safeParse(dsr).success).toBe(true);
    for (const status of ["completed", "rejected"])
      expect(
        DataSubjectRequestSchema.safeParse({
          ...dsr,
          status,
          completedAt: "2026-11-20T00:00:00Z",
        }).success,
        status,
      ).toBe(true);
  });

  it("rejects bad due dates, completion mismatches and kinds", () => {
    rejects(DataSubjectRequestSchema, [
      { ...dsr, dueAt: dsr.receivedAt },
      { ...dsr, completedAt: "2026-11-20T00:00:00Z" },
      { ...dsr, status: "completed" },
      { ...dsr, status: "completed", completedAt: "2026-10-01T00:00:00Z" },
      { ...dsr, kind: "rectify" },
      { ...dsr, extra: true },
    ]);
  });
});

describe("CompliancePack", () => {
  it("accepts a pack and rejects out-of-range rules", () => {
    expect(CompliancePackSchema.safeParse(pack).success).toBe(true);
    rejects(CompliancePackSchema, [
      { ...pack, code: "hipaa" },
      { ...pack, dsrDueDays: 0 },
      { ...pack, dsrDueDays: 91 },
      { ...pack, minorAgeThreshold: 12 },
      { ...pack, minorAgeThreshold: 22 },
      { ...pack, retentionDaysDefault: 0 },
      { ...pack, region: "africa" },
      { ...pack, name: "DPDP" },
    ]);
  });
});
