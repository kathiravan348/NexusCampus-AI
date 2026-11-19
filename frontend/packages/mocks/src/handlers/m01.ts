import {
  AcademicCalendarSchema,
  AuditEventSchema,
  CampusSchema,
  GroupSchema,
  IdSchema,
  InstitutionSchema,
  InstitutionTypeProfileSchema,
  InstitutionTypeSchema,
  LocaleSchema,
  LocaleSettingsSchema,
  NameSchema,
  pageSchema,
  type AcademicCalendar,
  type AuditEvent,
  type Campus,
} from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { z } from "zod";
import {
  ApiFailure,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { auditHashInput } from "../fixtures/audit";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, getPublic, list, ok, param, type RouteContext } from "./route";

const M = { module: "M01" } as const;
const MANAGE = "m01.institution.manage";

export const DemoTenantEntrySchema = z.strictObject({
  tenantId: IdSchema,
  name: NameSchema,
  type: InstitutionTypeSchema,
  defaultLocale: LocaleSchema,
  personas: z.array(
    z.strictObject({ userId: IdSchema, labelKey: z.string().min(1), roleId: IdSchema }),
  ),
});
export type DemoTenantEntry = z.infer<typeof DemoTenantEntrySchema>;

export const TenantResponseSchema = z.strictObject({
  group: GroupSchema.nullable(),
  institutions: z.array(InstitutionSchema),
  campuses: z.array(CampusSchema),
});
export type TenantResponse = z.infer<typeof TenantResponseSchema>;

export const CampusInputSchema = CampusSchema.omit({ id: true, tenantId: true });
export type CampusInput = z.infer<typeof CampusInputSchema>;

/** The institution in `:id` (or `?institutionId=`, else the tenant's first) — 404 if not this tenant's. */
function institutionOf(ctx: RouteContext, id: string | null) {
  const own = ofTenant(mockDb.institutions, ctx.viewer.tenantId);
  return found(id === null ? own[0] : own.find((i) => i.id === id));
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
  }
}

function parseBody<T>(raw: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

function writeRoute(
  method: "post" | "put",
  path: string,
  resolve: (ctx: RouteContext) => Promise<Response>,
): HttpHandler {
  return http[method](`*${API_BASE}${path}`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, "M01")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has(MANAGE)) throw new ApiFailure("forbidden");
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (typeof v === "string") flat[k] = v;
      }
      return await resolve({
        request,
        url: new URL(request.url),
        params: flat,
        viewer,
        scenario: readScenario(request),
      });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  });
}

async function appendAudit(
  viewer: Viewer,
  action: string,
  targetType: string,
  targetId: string,
  fields: readonly string[],
): Promise<void> {
  const tenantEvents = ofTenant(mockDb.auditEvents, viewer.tenantId);
  const prevHash = tenantEvents[tenantEvents.length - 1]?.hash ?? null;
  const id = `aud-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  const occurredAt = new Date().toISOString();
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(auditHashInput({ id, occurredAt, action, prevHash })),
  );
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const event: AuditEvent = AuditEventSchema.parse({
    id,
    tenantId: viewer.tenantId,
    occurredAt,
    actorKind: "user",
    actorId: viewer.userId,
    grantId: null,
    action,
    moduleId: "M01",
    targetType,
    targetId,
    deviceId: null,
    changes: fields.map((field) => ({ field, sensitive: false })),
    prevHash,
    hash,
  });
  mockDb.auditEvents.push(event);
}

function assertUniqueCampusCode(institutionId: string, code: string, ignoreId?: string): void {
  const duplicate = mockDb.campuses.some(
    (c) => c.institutionId === institutionId && c.code === code && c.id !== ignoreId,
  );
  if (duplicate) {
    throw new ApiFailure("invalid_request", [
      { path: "code", message: "Campus code is already in use" },
    ]);
  }
}

export const m01Handlers = [
  getPublic("/demo-tenants", ({ scenario }) =>
    ok(
      z.array(DemoTenantEntrySchema),
      (scenario === "empty" ? [] : mockDb.demoTenants).map((t) => ({
        tenantId: t.tenantId,
        name: t.name,
        type: t.type,
        defaultLocale:
          mockDb.institutions.find((i) => i.tenantId === t.tenantId)?.locale.defaultLocale ?? "en",
        personas: mockDb.demoPersonas
          .filter((p) => p.tenantId === t.tenantId)
          .map(({ userId, labelKey, roleId }) => ({ userId, labelKey, roleId })),
      })),
    ),
  ),

  get("/tenant", M, (ctx) => {
    const tenantId = ctx.viewer.tenantId;
    return ok(TenantResponseSchema, {
      group: mockDb.groups.find((g) => g.tenantId === tenantId) ?? null,
      institutions: ofTenant(mockDb.institutions, tenantId),
      campuses: ofTenant(mockDb.campuses, tenantId),
    });
  }),

  get("/institutions/:id/profile", M, (ctx) => {
    const institution = institutionOf(ctx, ctx.params["id"] ?? "");
    return ok(
      InstitutionTypeProfileSchema,
      found(mockDb.typeProfiles.find((p) => p.type === institution.type)),
    );
  }),

  get("/institutions/:id/calendars", M, (ctx) => {
    const institution = institutionOf(ctx, ctx.params["id"] ?? "");
    const calendars = ofTenant(mockDb.calendars, ctx.viewer.tenantId).filter(
      (c) => c.institutionId === institution.id,
    );
    return list(ctx, calendars, pageSchema(AcademicCalendarSchema));
  }),

  get("/locale-settings", M, (ctx) =>
    ok(LocaleSettingsSchema, institutionOf(ctx, param(ctx.url, "institutionId")).locale),
  ),

  writeRoute("put", "/locale-settings", async (ctx) => {
    const institution = institutionOf(ctx, param(ctx.url, "institutionId"));
    const locale = parseBody(await readJson(ctx.request), LocaleSettingsSchema);
    institution.locale = locale;
    institution.updatedAt = new Date().toISOString();
    await appendAudit(ctx.viewer, "m01.institution.updated", "institution", institution.id, [
      "locale",
    ]);
    return ok(LocaleSettingsSchema, locale);
  }),

  writeRoute("post", "/campuses", async (ctx) => {
    const input = parseBody(await readJson(ctx.request), CampusInputSchema);
    const institution = institutionOf(ctx, input.institutionId);
    assertUniqueCampusCode(institution.id, input.code);
    const campus = CampusSchema.parse({
      ...input,
      id: `cmp-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      tenantId: ctx.viewer.tenantId,
      institutionId: institution.id,
    });
    (mockDb.campuses as Campus[]).push(campus);
    await appendAudit(ctx.viewer, "m01.campus.created", "campus", campus.id, ["code", "name"]);
    return HttpResponse.json(campus as JsonBodyType, { status: 201 });
  }),

  writeRoute("put", "/campuses/:id", async (ctx) => {
    const existing = found(
      ofTenant(mockDb.campuses, ctx.viewer.tenantId).find((c) => c.id === ctx.params["id"]),
    );
    const input = parseBody(await readJson(ctx.request), CampusInputSchema);
    const institution = institutionOf(ctx, input.institutionId);
    assertUniqueCampusCode(institution.id, input.code, existing.id);
    const updated = CampusSchema.parse({
      ...input,
      id: existing.id,
      tenantId: existing.tenantId,
      institutionId: institution.id,
    });
    const campuses = mockDb.campuses as Campus[];
    campuses[campuses.findIndex((c) => c.id === existing.id)] = updated;
    await appendAudit(ctx.viewer, "m01.campus.updated", "campus", updated.id, [
      "code",
      "name",
      "timeZone",
      "address",
    ]);
    return ok(CampusSchema, updated);
  }),

  writeRoute("put", "/institutions/:id/calendars/:calendarId", async (ctx) => {
    const institution = institutionOf(ctx, ctx.params["id"] ?? "");
    const existing = found(
      ofTenant(mockDb.calendars, ctx.viewer.tenantId).find(
        (c) => c.id === ctx.params["calendarId"] && c.institutionId === institution.id,
      ),
    );
    const raw = await readJson(ctx.request);
    const body = typeof raw === "object" && raw !== null ? raw : {};
    const updated = parseBody(
      { ...body, id: existing.id, tenantId: existing.tenantId, institutionId: institution.id },
      AcademicCalendarSchema,
    );
    const calendars = mockDb.calendars as AcademicCalendar[];
    calendars[calendars.findIndex((c) => c.id === existing.id)] = updated;
    await appendAudit(ctx.viewer, "m01.calendar.updated", "academicCalendar", existing.id, [
      "academicYear",
      "periods",
      "holidays",
      "displayCalendar",
    ]);
    return ok(AcademicCalendarSchema, updated);
  }),
];
