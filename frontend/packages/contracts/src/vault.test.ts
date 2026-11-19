import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { AiCreditSchema, AiSettingsSchema, AssistAnswerSchema } from "./ai";
import {
  AccessGrantSchema,
  AccessRequestSchema,
  BreakGlassNoticeSchema,
  KeyStatusSchema,
} from "./vault";

const key = {
  id: "key_nbu_data",
  tenantId: "ten_northbridge",
  purpose: "tenant_data",
  custody: "byok",
  status: "active",
  createdAt: "2026-01-01T00:00:00Z",
  rotatedAt: "2026-07-01T00:00:00Z",
};

const request = {
  id: "acr_01",
  tenantId: "ten_apex",
  staffRef: "stf_ref_9",
  staffDisplayName: "Support agent 9",
  reason: "Investigate a failing report export (ticket 4411)",
  modules: ["M01", "M04"],
  mode: "read",
  durationHours: 24,
  status: "pending",
  requestedAt: "2026-11-17T09:00:00Z",
  decidedAt: null,
  decidedBy: null,
};

const grant = {
  id: "grt_01",
  tenantId: "ten_apex",
  requestId: "acr_01",
  modules: ["M04"],
  mode: "read",
  startsAt: "2026-11-17T10:00:00Z",
  endsAt: "2026-11-20T10:00:00Z",
  revokedAt: null,
};

const notice = {
  id: "bgn_01",
  tenantId: "ten_northbridge",
  category: "security_incident",
  approverRefs: ["stf_ref_1", "stf_ref_2"],
  occurredAt: "2026-10-05T02:00:00Z",
  notifiedAt: "2026-10-05T02:05:00Z",
  reportUrl: null,
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("KeyStatus", () => {
  it("accepts metadata only", () => {
    expect(KeyStatusSchema.safeParse(key).success).toBe(true);
    rejects(KeyStatusSchema, [
      { ...key, rotatedAt: "2025-12-31T00:00:00Z" },
      { ...key, custody: "customer" },
      { ...key, status: "lost" },
      { ...key, keyMaterial: "AAAA" },
    ]);
  });
});

describe("AccessRequest", () => {
  it("accepts pending and decided requests", () => {
    expect(AccessRequestSchema.safeParse(request).success).toBe(true);
    for (const status of ["approved", "denied", "expired", "revoked"])
      expect(
        AccessRequestSchema.safeParse({
          ...request,
          status,
          decidedAt: "2026-11-17T09:30:00Z",
          decidedBy: "usr_apex_admin",
        }).success,
        status,
      ).toBe(true);
  });

  it("enforces 1–72 h, unique modules and decision fields", () => {
    rejects(AccessRequestSchema, [
      { ...request, durationHours: 73 },
      { ...request, durationHours: 0 },
      { ...request, modules: [] },
      { ...request, modules: ["M01", "M01"] },
      { ...request, mode: "admin" },
      { ...request, decidedAt: "2026-11-17T09:30:00Z", decidedBy: "usr_apex_admin" },
      { ...request, status: "approved" },
      { ...request, status: "approved", decidedAt: "2026-11-17T09:30:00Z" },
      {
        ...request,
        status: "denied",
        decidedAt: "2026-11-17T08:00:00Z",
        decidedBy: "usr_apex_admin",
      },
      { ...request, reason: "" },
    ]);
  });
});

describe("AccessGrant", () => {
  it("accepts a 72 h grant and an early revoke", () => {
    expect(AccessGrantSchema.safeParse(grant).success).toBe(true);
    expect(
      AccessGrantSchema.safeParse({ ...grant, revokedAt: "2026-11-17T12:00:00Z" }).success,
    ).toBe(true);
  });

  it("rejects grants over 72 h, empty or reversed windows", () => {
    rejects(AccessGrantSchema, [
      { ...grant, endsAt: "2026-11-20T10:00:01Z" },
      { ...grant, endsAt: grant.startsAt },
      { ...grant, endsAt: "2026-11-17T09:00:00Z" },
      { ...grant, revokedAt: "2026-11-17T09:00:00Z" },
      { ...grant, modules: [] },
      { ...grant, credential: "x" },
    ]);
  });
});

describe("BreakGlassNotice", () => {
  it("accepts two distinct approvers and a report link", () => {
    expect(BreakGlassNoticeSchema.safeParse(notice).success).toBe(true);
    expect(
      BreakGlassNoticeSchema.safeParse({ ...notice, reportUrl: "https://trust.example.test/r/1" })
        .success,
    ).toBe(true);
  });

  it("rejects one, three or repeated approvers and late occurrence", () => {
    rejects(BreakGlassNoticeSchema, [
      { ...notice, approverRefs: ["stf_ref_1"] },
      { ...notice, approverRefs: ["stf_ref_1", "stf_ref_2", "stf_ref_3"] },
      { ...notice, approverRefs: ["stf_ref_1", "stf_ref_1"] },
      { ...notice, notifiedAt: "2026-10-05T01:59:59Z" },
      { ...notice, category: "audit" },
      { ...notice, reportUrl: "http://trust.example.test/r/1" },
    ]);
  });
});

const SECRET_FIELD = /material|secret|token|private|wrapped|apikey/i;

/** Every field name in an object schema, including nested objects, arrays, tuples and nullables. */
interface SchemaDef {
  readonly type: string;
  readonly shape?: Readonly<Record<string, z.ZodType>>;
  readonly innerType?: z.ZodType;
  readonly element?: z.ZodType;
  readonly items?: readonly z.ZodType[];
}

function fieldNames(schema: z.ZodType, prefix = ""): string[] {
  const def = (schema as unknown as { _zod: { def: SchemaDef } })._zod.def;
  switch (def.type) {
    case "object":
      return Object.entries(def.shape ?? {}).flatMap(([k, v]) => [
        `${prefix}${k}`,
        ...fieldNames(v, `${prefix}${k}.`),
      ]);
    case "nullable":
    case "optional":
      return def.innerType ? fieldNames(def.innerType, prefix) : [];
    case "array":
      return def.element ? fieldNames(def.element, prefix) : [];
    case "tuple":
      return (def.items ?? []).flatMap((i) => fieldNames(i, prefix));
    default:
      return [];
  }
}

describe("vault and AI contracts carry no secrets", () => {
  it("no field name looks like key material, a secret or a token", () => {
    const schemas = [
      KeyStatusSchema,
      AccessRequestSchema,
      AccessGrantSchema,
      BreakGlassNoticeSchema,
      AiSettingsSchema,
      AiCreditSchema,
      AssistAnswerSchema,
    ];
    const names = schemas.flatMap((s) => fieldNames(s));
    expect(names).toContain("provider.label");
    expect(names).toContain("sources.recordId");
    for (const name of names) expect(name).not.toMatch(SECRET_FIELD);
  });
});
