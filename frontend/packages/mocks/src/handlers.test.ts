import {
  AcademicCalendarSchema,
  AccessGrantSchema,
  AccessRequestSchema,
  AiCreditSchema,
  AiSettingsSchema,
  ApiErrorSchema,
  AuditEventSchema,
  BreakGlassNoticeSchema,
  CompliancePackSchema,
  ConsentSchema,
  DataSubjectRequestSchema,
  DeviceSyncSchema,
  EntitlementSchema,
  FontSchema,
  InstitutionTypeProfileSchema,
  KeyStatusSchema,
  LocaleSettingsSchema,
  NotificationDeliverySchema,
  NotificationPreferenceSchema,
  NotificationTemplateSchema,
  PermissionSchema,
  PersonSchema,
  PlanSchema,
  RoleAssignmentSchema,
  RoleSchema,
  SessionSchema,
  SsoProviderSchema,
  SyncConflictSchema,
  TextOverrideRevisionSchema,
  TextOverrideSchema,
  UsageMeterSchema,
  UserSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { MOCK_HEADER, maskPerson, readViewer } from "./context";
import { mockDb, resetMockDb } from "./db";
import { INSTITUTION, PERSON, TENANT, USER } from "./fixtures";
import {
  DemoTenantEntrySchema,
  MeResponseSchema,
  TenantResponseSchema,
  ThemeResponseSchema,
} from "./handlers";
import { server } from "./node";

interface Parser {
  parse(value: unknown): unknown;
}

const BASE = "http://localhost/api/v1";
const RV = { tenant: TENANT.riverside, user: USER.rvHelen };
const RV_SCHOOL = INSTITUTION.riversideSchool;

function call(
  path: string,
  as: { tenant?: string; user?: string; scenario?: string } = RV,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (as.tenant) headers[MOCK_HEADER.tenant] = as.tenant;
  if (as.user) headers[MOCK_HEADER.user] = as.user;
  if (as.scenario) headers[MOCK_HEADER.scenario] = as.scenario;
  return fetch(`${BASE}${path}`, { headers });
}

async function errorCode(res: Response): Promise<string> {
  return ApiErrorSchema.parse(await res.json()).error.code;
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

/** Riverside (enterprise plan, every module on) as its owner/admin: every endpoint answers 200. */
const ENDPOINTS: [string, Parser][] = [
  ["/tenant", TenantResponseSchema],
  [`/institutions/${RV_SCHOOL}/profile`, InstitutionTypeProfileSchema],
  [`/institutions/${RV_SCHOOL}/calendars`, pageSchema(AcademicCalendarSchema)],
  ["/locale-settings", LocaleSettingsSchema],
  ["/me", MeResponseSchema],
  ["/people", pageSchema(PersonSchema)],
  ["/users", pageSchema(UserSchema)],
  ["/roles", pageSchema(RoleSchema)],
  ["/permissions", pageSchema(PermissionSchema)],
  ["/role-assignments", pageSchema(RoleAssignmentSchema)],
  ["/sso-providers", pageSchema(SsoProviderSchema)],
  ["/sessions", pageSchema(SessionSchema)],
  ["/theme", ThemeResponseSchema],
  ["/fonts", pageSchema(FontSchema)],
  ["/texts/overrides?locale=en", pageSchema(TextOverrideSchema)],
  ["/texts/revisions?key=term.learner", pageSchema(TextOverrideRevisionSchema)],
  ["/plan", PlanSchema],
  ["/entitlements", pageSchema(EntitlementSchema)],
  ["/usage", pageSchema(UsageMeterSchema)],
  ["/audit-events", pageSchema(AuditEventSchema)],
  ["/consents", pageSchema(ConsentSchema)],
  ["/data-requests", pageSchema(DataSubjectRequestSchema)],
  ["/compliance-packs", pageSchema(CompliancePackSchema)],
  ["/notification-templates", pageSchema(NotificationTemplateSchema)],
  ["/notification-deliveries", pageSchema(NotificationDeliverySchema)],
  ["/notification-preferences", pageSchema(NotificationPreferenceSchema)],
  ["/devices", pageSchema(DeviceSyncSchema)],
  ["/sync-conflicts", pageSchema(SyncConflictSchema)],
  ["/ai/settings", AiSettingsSchema],
  ["/ai/credits", pageSchema(AiCreditSchema)],
  ["/vault/keys", pageSchema(KeyStatusSchema)],
  ["/access-requests", pageSchema(AccessRequestSchema)],
  ["/access-grants", pageSchema(AccessGrantSchema)],
  ["/break-glass-notices", pageSchema(BreakGlassNoticeSchema)],
];

/** Every `tenantId` anywhere in a response body. */
function tenantIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) tenantIds(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "tenantId" && typeof v === "string") out.add(v);
      else tenantIds(v, out);
    }
  }
  return out;
}

describe("read endpoints", () => {
  it.each(ENDPOINTS)(
    "GET %s parses with its contract and stays in the tenant",
    async (path, schema) => {
      const res = await call(path);
      expect(res.status, path).toBe(200);
      const body: unknown = await res.json();
      expect(() => schema.parse(body)).not.toThrow();
      expect(
        [...tenantIds(body)].every((t) => t === TENANT.riverside),
        path,
      ).toBe(true);
    },
  );

  it("GET /demo-tenants needs no headers and lists every tenant with personas", async () => {
    const res = await call("/demo-tenants", {});
    expect(res.status).toBe(200);
    const body = z.array(DemoTenantEntrySchema).parse(await res.json());
    expect(body.map((t) => t.tenantId).sort()).toEqual(Object.values(TENANT).sort());
    expect(body.find((t) => t.tenantId === TENANT.apex)?.defaultLocale).toBe("ar-AE");
    for (const t of body) expect(t.personas.length).toBeGreaterThan(0);
  });

  it("filters audit events and rejects a bad date", async () => {
    const all = pageSchema(AuditEventSchema).parse(await (await call("/audit-events")).json());
    const action = all.items[0]?.action ?? "";
    const one = pageSchema(AuditEventSchema).parse(
      await (await call(`/audit-events?action=${action}`)).json(),
    );
    expect(one.items.length).toBeGreaterThan(0);
    expect(one.items.every((e) => e.action === action)).toBe(true);
    const future = pageSchema(AuditEventSchema).parse(
      await (await call("/audit-events?from=2099-01-01T00:00:00Z")).json(),
    );
    expect(future.total).toBe(0);
    const bad = await call("/audit-events?from=yesterday");
    expect(bad.status).toBe(400);
    expect(await errorCode(bad)).toBe("invalid_request");
  });
});

describe("access rules", () => {
  it("401 without a tenant, without a user, or with a user of another tenant", async () => {
    for (const as of [
      { user: USER.rvHelen },
      { tenant: TENANT.riverside },
      { tenant: TENANT.riverside, user: USER.lsPriya },
    ]) {
      const res = await call("/me", as);
      expect(res.status).toBe(401);
      expect(await errorCode(res)).toBe("unauthorized");
    }
  });

  it("404 for another tenant's institution", async () => {
    const as = { tenant: TENANT.littleSteps, user: USER.lsPriya };
    for (const path of [
      `/institutions/${RV_SCHOOL}/profile`,
      `/locale-settings?institutionId=${RV_SCHOOL}`,
    ]) {
      const res = await call(path, as);
      expect(res.status, path).toBe(404);
      expect(await errorCode(res)).toBe("not_found");
    }
  });

  it("403 forbidden without the permission (teacher → roles, vault, audit)", async () => {
    const teacher = { tenant: TENANT.riverside, user: USER.rvTom };
    for (const path of ["/roles", "/vault/keys", "/audit-events", "/access-requests"]) {
      const res = await call(path, teacher);
      expect(res.status, path).toBe(403);
      expect(await errorCode(res)).toBe("forbidden");
    }
  });

  it("403 module_disabled when the plan does not include the module", async () => {
    const harmony = { tenant: TENANT.harmony, user: USER.hmWeiLing };
    const littleSteps = { tenant: TENANT.littleSteps, user: USER.lsPriya };
    for (const [path, as] of [
      ["/devices", harmony],
      ["/ai/settings", harmony],
      ["/ai/settings", littleSteps],
    ] as const) {
      const res = await call(path, as);
      expect(res.status, path).toBe(403);
      expect(await errorCode(res)).toBe("module_disabled");
    }
  });
});

describe("paging", () => {
  it("returns the requested page and total", async () => {
    const page = pageSchema(PersonSchema).parse(
      await (await call("/people?page=2&pageSize=3")).json(),
    );
    const total = mockDb.people.filter((p) => p.tenantId === TENANT.riverside).length;
    expect(page).toMatchObject({ page: 2, pageSize: 3, total });
    expect(page.items).toHaveLength(Math.min(3, total - 3));
  });

  it("returns an empty page past the end", async () => {
    const page = pageSchema(PersonSchema).parse(await (await call("/people?page=99")).json());
    expect(page.items).toEqual([]);
  });

  it.each(["page=0", "pageSize=0", "pageSize=201", "page=1.5", "page=abc", "page="])(
    "400 invalid_request for %s",
    async (query) => {
      const res = await call(`/people?${query}`);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("invalid_request");
    },
  );
});

describe("minor masking (G-6)", () => {
  const rohan = (people: z.infer<typeof PersonSchema>[]) =>
    people.find((p) => p.id === PERSON.lsRohan);

  it("masks a minor's date of birth and contact details for a teacher", async () => {
    const teacher = { tenant: TENANT.littleSteps, user: USER.lsArjun };
    const page = pageSchema(PersonSchema).parse(await (await call("/people", teacher)).json());
    expect(rohan(page.items)).toMatchObject({ dateOfBirth: null, phone: null, email: null });
  });

  it("shows the minor unmasked to their guardian, who sees only their family", async () => {
    const guardian = { tenant: TENANT.littleSteps, user: USER.lsSunita };
    const page = pageSchema(PersonSchema).parse(await (await call("/people", guardian)).json());
    expect(rohan(page.items)?.dateOfBirth).not.toBeNull();
    expect(page.items.map((p) => p.id).sort()).toEqual(
      [PERSON.lsSunita, PERSON.lsRohan, PERSON.lsIshaan].sort(),
    );
  });

  it("shows minors unmasked with the restricted-data permission", () => {
    const viewer = readViewer(
      new Request(BASE, {
        headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: USER.lsPriya },
      }),
    );
    const person = mockDb.people.find((p) => p.id === PERSON.lsRohan);
    expect(person && maskPerson(person, viewer).dateOfBirth).not.toBeNull();
  });
});

describe("scenarios", () => {
  it("empty → empty pages, objects unchanged", async () => {
    const page = pageSchema(PersonSchema).parse(
      await (await call("/people", { ...RV, scenario: "empty" })).json(),
    );
    expect(page).toMatchObject({ items: [], total: 0 });
    expect((await call("/me", { ...RV, scenario: "empty" })).status).toBe(200);
  });

  it("error → 500 internal", async () => {
    const res = await call("/people", { ...RV, scenario: "error" });
    expect(res.status).toBe(500);
    expect(await errorCode(res)).toBe("internal");
  });

  it("slow → answers after the delay", async () => {
    const started = Date.now();
    expect((await call("/me", { ...RV, scenario: "slow" })).status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1400);
  });

  it("offline → network error", async () => {
    await expect(call("/me", { ...RV, scenario: "offline" })).rejects.toThrow();
  });
});

describe("mock DB", () => {
  it("resets to the fixtures", () => {
    mockDb.people.length = 0;
    resetMockDb();
    expect(mockDb.people.length).toBeGreaterThan(0);
  });
});
