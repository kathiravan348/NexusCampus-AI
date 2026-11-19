import {
  AcademicCalendarSchema,
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
} from "@nexus/contracts";
import { z } from "zod";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, getPublic, list, ok, type RouteContext } from "./route";

const M = { module: "M01" } as const;

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

/** The institution in `:id` (or `?institutionId=`, else the tenant's first) — 404 if not this tenant's. */
function institutionOf(ctx: RouteContext, id: string | null) {
  const own = ofTenant(mockDb.institutions, ctx.viewer.tenantId);
  return found(id === null ? own[0] : own.find((i) => i.id === id));
}

export const m01Handlers = [
  getPublic("/demo-tenants", () =>
    ok(
      z.array(DemoTenantEntrySchema),
      mockDb.demoTenants.map((t) => ({
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
    ok(LocaleSettingsSchema, institutionOf(ctx, ctx.url.searchParams.get("institutionId")).locale),
  ),
];
