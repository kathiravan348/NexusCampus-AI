import {
  AcademicCalendarSchema,
  CampusSchema,
  EntitlementSchema,
  FontSchema,
  GroupSchema,
  InstitutionSchema,
  InstitutionTypeProfileSchema,
  PermissionSchema,
  PersonSchema,
  PlanSchema,
  RoleAssignmentSchema,
  RoleProfileSchema,
  RoleSchema,
  SessionSchema,
  SsoProviderSchema,
  TextOverrideRevisionSchema,
  TextOverrideSchema,
  ThemeSchema,
  UsageMeterSchema,
  UserSchema,
} from "@nexus/contracts";
import { describe, expect, it } from "vitest";
interface Parser {
  safeParse(value: unknown): { error?: unknown };
}
import * as F from "./index";

const SETS: [string, Parser, readonly unknown[]][] = [
  ["GROUPS", GroupSchema, F.GROUPS],
  ["INSTITUTIONS", InstitutionSchema, F.INSTITUTIONS],
  ["CAMPUSES", CampusSchema, F.CAMPUSES],
  ["INSTITUTION_TYPE_PROFILES", InstitutionTypeProfileSchema, F.INSTITUTION_TYPE_PROFILES],
  ["ACADEMIC_CALENDARS", AcademicCalendarSchema, F.ACADEMIC_CALENDARS],
  ["PEOPLE", PersonSchema, F.PEOPLE],
  ["ROLE_PROFILES", RoleProfileSchema, F.ROLE_PROFILES],
  ["USERS", UserSchema, F.USERS],
  ["SESSIONS", SessionSchema, F.SESSIONS],
  ["SSO_PROVIDERS", SsoProviderSchema, F.SSO_PROVIDERS],
  ["PERMISSIONS", PermissionSchema, F.PERMISSIONS],
  ["ROLES", RoleSchema, F.ROLES],
  ["ROLE_ASSIGNMENTS", RoleAssignmentSchema, F.ROLE_ASSIGNMENTS],
  ["FONTS", FontSchema, F.FONTS],
  ["THEMES", ThemeSchema, F.THEMES],
  ["TEXT_OVERRIDES", TextOverrideSchema, F.TEXT_OVERRIDES],
  ["TEXT_OVERRIDE_REVISIONS", TextOverrideRevisionSchema, F.TEXT_OVERRIDE_REVISIONS],
  ["PLANS", PlanSchema, F.PLANS],
  ["ENTITLEMENTS", EntitlementSchema, F.ENTITLEMENTS],
  ["USAGE_METERS", UsageMeterSchema, F.USAGE_METERS],
];

const ids = (rows: readonly { id: string }[]) => new Set(rows.map((r) => r.id));
const tenantIds = new Set(F.DEMO_TENANTS.map((t) => t.tenantId));

const calendarIds = ids(F.ACADEMIC_CALENDARS);
const personIds = ids(F.PEOPLE);
const userIds = ids(F.USERS);

const fontIds = ids(F.FONTS);
const overrideIds = ids(F.TEXT_OVERRIDES);
const tenantOf = new Map<string, string>(
  [...F.PEOPLE, ...F.USERS, ...F.INSTITUTIONS, ...F.CAMPUSES, ...F.GROUPS, ...F.ROLES].map((r) => [
    r.id,
    r.tenantId,
  ]),
);
const sameTenant = (tenantId: string, id: string | null) =>
  id === null || tenantOf.get(id) === tenantId;

describe("fixtures (D16)", () => {
  it.each(SETS)("%s parse with their contract", (_name, schema, rows) => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows)
      expect(schema.safeParse(row).error, JSON.stringify(row)).toBeUndefined();
  });

  it("have unique ids per collection", () => {
    for (const [name, , rows] of SETS) {
      const keyed = rows.filter(
        (r): r is { id: string } => typeof (r as { id?: unknown }).id === "string",
      );
      expect(new Set(keyed.map((r) => r.id)).size, name).toBe(keyed.length);
    }
    expect(new Set(F.PERMISSIONS.map((p) => p.code)).size).toBe(F.PERMISSIONS.length);
  });

  it("cover every D16 type, with one Arabic RTL tenant and a 2-campus group", () => {
    expect(F.DEMO_TENANTS).toHaveLength(5);
    expect(new Set(F.DEMO_TENANTS.map((t) => t.type))).toEqual(
      new Set(["ey", "grp", "he", "tp", "sk"]),
    );
    expect(new Set(F.INSTITUTIONS.map((i) => i.type))).toEqual(
      new Set(["ey", "k12", "he", "tp", "sk"]),
    );
    const riverside = F.DEMO_TENANTS.find((t) => t.tenantId === F.TENANT.riverside);
    expect(riverside?.group?.id).toBe(F.GROUP.riverside);
    expect(riverside?.campuses).toHaveLength(2);
    const apex = F.INSTITUTIONS.find((i) => i.id === F.INSTITUTION.apex);
    expect(apex?.locale.defaultLocale).toBe("ar-AE");
    expect(apex?.locale.weekendDays).toEqual([6, 0]);
    expect(F.ACADEMIC_CALENDARS.find((c) => c.id === F.CALENDAR.apex)?.displayCalendar).toBe(
      "islamic-umalqura",
    );
  });

  it("resolve tenancy and calendar references", () => {
    for (const t of F.DEMO_TENANTS) {
      expect(t.institutions.length, t.tenantId).toBeGreaterThan(0);
      expect(t.campuses.length, t.tenantId).toBeGreaterThan(0);
    }
    for (const g of F.GROUPS) expect(tenantIds).toContain(g.tenantId);
    for (const i of F.INSTITUTIONS) {
      expect(tenantIds).toContain(i.tenantId);
      if (i.groupId !== null) expect(tenantOf.get(i.groupId)).toBe(i.tenantId);
    }
    for (const c of F.CAMPUSES) expect(tenantOf.get(c.institutionId)).toBe(c.tenantId);
    for (const institution of F.INSTITUTIONS) {
      expect(F.ACADEMIC_CALENDARS.filter((c) => c.institutionId === institution.id)).toHaveLength(
        1,
      );
      expect(F.INSTITUTION_TYPE_PROFILES.map((p) => p.type)).toContain(institution.type);
    }
    for (const c of F.ACADEMIC_CALENDARS) expect(tenantOf.get(c.institutionId)).toBe(c.tenantId);
  });

  it("resolve people, role profiles and guardian links", () => {
    for (const p of F.PEOPLE) expect(tenantIds).toContain(p.tenantId);
    for (const t of F.DEMO_TENANTS) {
      const count = F.PEOPLE.filter((p) => p.tenantId === t.tenantId).length;
      expect(count, t.tenantId).toBeGreaterThanOrEqual(6);
      expect(count, t.tenantId).toBeLessThanOrEqual(12);
      const kinds = (personId: string) =>
        F.ROLE_PROFILES.filter((r) => r.personId === personId).map((r) => r.kind);
      const staffGuardians = F.PEOPLE.filter(
        (p) =>
          p.tenantId === t.tenantId &&
          kinds(p.id).includes("staff") &&
          kinds(p.id).includes("guardian"),
      );
      expect(staffGuardians.length, t.tenantId).toBeGreaterThanOrEqual(1);
    }
    for (const r of F.ROLE_PROFILES) {
      expect(personIds).toContain(r.personId);
      expect(sameTenant(r.tenantId, r.personId), r.id).toBe(true);
      expect(sameTenant(r.tenantId, r.institutionId), r.id).toBe(true);
      expect(sameTenant(r.tenantId, r.campusId), r.id).toBe(true);
      if (r.academicYearId !== null) expect(calendarIds).toContain(r.academicYearId);
    }
    const hasKind = (personId: string, kind: string) =>
      F.ROLE_PROFILES.some((r) => r.personId === personId && r.kind === kind);
    for (const l of F.GUARDIAN_LINKS) {
      expect(sameTenant(l.tenantId, l.guardianPersonId), l.guardianPersonId).toBe(true);
      expect(sameTenant(l.tenantId, l.learnerPersonId), l.learnerPersonId).toBe(true);
      expect(hasKind(l.guardianPersonId, "guardian"), l.guardianPersonId).toBe(true);
      expect(hasKind(l.learnerPersonId, "learner"), l.learnerPersonId).toBe(true);
    }
    for (const minor of F.PEOPLE.filter((p) => p.isMinor)) {
      expect(
        F.GUARDIAN_LINKS.some((l) => l.learnerPersonId === minor.id),
        minor.id,
      ).toBe(true);
    }
  });

  it("mark minors consistently with their date of birth and type", () => {
    const ageOn = (dob: string, on: string) => {
      const years = Number(on.slice(0, 4)) - Number(dob.slice(0, 4));
      return on.slice(5) < dob.slice(5) ? years - 1 : years;
    };
    for (const p of F.PEOPLE) {
      if (p.dateOfBirth !== null)
        expect(p.isMinor, p.id).toBe(ageOn(p.dateOfBirth, "2026-09-01") < 18);
    }
    for (const institution of F.INSTITUTIONS.filter((i) => i.type === "ey" || i.type === "k12")) {
      const learners = F.ROLE_PROFILES.filter(
        (r) => r.institutionId === institution.id && r.kind === "learner",
      );
      for (const r of learners)
        expect(F.PEOPLE.find((p) => p.id === r.personId)?.isMinor).toBe(true);
    }
  });

  it("use only fictional contact details", () => {
    for (const p of F.PEOPLE) {
      if (p.email !== null) expect(p.email, p.id).toMatch(/@([a-z0-9-]+\.)*(example\.edu|test)$/);
    }
  });

  it("resolve identity and RBAC references", () => {
    for (const u of F.USERS) {
      const person = F.PEOPLE.find((p) => p.id === u.personId);
      expect(person?.tenantId, u.id).toBe(u.tenantId);
      expect(person?.email, u.id).toBe(u.email);
    }
    for (const s of F.SESSIONS) expect(sameTenant(s.tenantId, s.userId), s.id).toBe(true);
    expect(F.SSO_PROVIDERS.map((p) => [p.tenantId, p.protocol])).toEqual([
      [F.TENANT.riverside, "saml2"],
      [F.TENANT.northbridge, "oidc"],
    ]);
    for (const p of F.SSO_PROVIDERS) expect(sameTenant(p.tenantId, p.institutionId)).toBe(true);
    const codes = new Set(F.PERMISSIONS.map((p) => p.code));
    for (const r of F.ROLES) for (const c of r.permissions) expect(codes, r.id).toContain(c);
    for (const t of tenantIds) {
      expect(F.ROLES.filter((r) => r.tenantId === t).map((r) => r.name)).toHaveLength(5);
    }
    for (const a of F.ROLE_ASSIGNMENTS) {
      expect(sameTenant(a.tenantId, a.userId), a.id).toBe(true);
      expect(sameTenant(a.tenantId, a.roleId), a.id).toBe(true);
      expect(sameTenant(a.tenantId, a.grantedBy), a.id).toBe(true);
      expect(sameTenant(a.tenantId, a.scope.targetId), a.id).toBe(true);
      const role = F.ROLES.find((r) => r.id === a.roleId);
      expect(role?.allowedScopeKinds, a.id).toContain(a.scope.kind);
    }
    for (const p of F.DEMO_PERSONAS) {
      expect(sameTenant(p.tenantId, p.userId), p.userId).toBe(true);
      expect(
        F.ROLE_ASSIGNMENTS.some((a) => a.userId === p.userId && a.roleId === p.roleId),
        p.userId,
      ).toBe(true);
    }
  });

  it("resolve studio references; Riverside locks brand-primary at group level", () => {
    for (const t of F.THEMES) {
      expect(sameTenant(t.tenantId, t.scope.targetId), t.id).toBe(true);
      expect(sameTenant(t.tenantId, t.updatedBy), t.id).toBe(true);
      for (const font of [t.fonts.sans, t.fonts.mono]) if (font) expect(fontIds).toContain(font);
    }
    expect(F.THEMES.filter((t) => t.scope.kind === "platform")).toHaveLength(0);
    const group = F.THEMES.find((t) => t.id === F.THEME.riversideGroup);
    expect(group?.scope).toEqual({ kind: "group", targetId: F.GROUP.riverside });
    expect(group?.lockedTokens).toContain("brand-primary");
    const children = F.THEMES.filter((t) => t.tenantId === F.TENANT.riverside && t !== group);
    for (const child of children) {
      expect(child.light["brand-primary"], child.id).toBeUndefined();
      expect(child.dark["brand-primary"], child.id).toBeUndefined();
    }
    expect(F.THEMES.find((t) => t.id === F.THEME.apex)?.fonts.sans).toBe(F.FONT.notoSansArabic);
    for (const o of F.TEXT_OVERRIDES) {
      expect(sameTenant(o.tenantId, o.scope.targetId), o.id).toBe(true);
      expect(sameTenant(o.tenantId, o.updatedBy), o.id).toBe(true);
      const revs = F.TEXT_OVERRIDE_REVISIONS.filter((r) => r.overrideId === o.id);
      expect(
        revs.map((r) => r.version),
        o.id,
      ).toEqual(Array.from({ length: o.version }, (_, i) => i + 1));
      expect(revs.at(-1)?.message, o.id).toBe(o.message);
    }
    for (const r of F.TEXT_OVERRIDE_REVISIONS) expect(overrideIds).toContain(r.overrideId);
    for (const r of F.TEXT_OVERRIDE_REVISIONS) expect(userIds).toContain(r.changedBy);
  });

  it("resolve plans, entitlements and usage totals", () => {
    const planIds = ids(F.PLANS);
    for (const t of tenantIds) expect(planIds).toContain(F.TENANT_PLANS[t]);
    for (const e of F.ENTITLEMENTS) expect(tenantIds).toContain(e.tenantId);
    const ent = (t: string, m: string) =>
      F.ENTITLEMENTS.find((e) => e.tenantId === t && e.moduleId === m);
    expect(ent(F.TENANT.littleSteps, "M11")?.enabled).toBe(false);
    expect(ent(F.TENANT.harmony, "M07")?.source).toBe("trial");
    for (const t of tenantIds) {
      const learners = F.ROLE_PROFILES.filter((r) => r.tenantId === t && r.kind === "learner");
      const meter = F.USAGE_METERS.find((u) => u.tenantId === t && u.metric === "learners");
      expect(meter?.used, t).toBe(learners.length);
    }
  });
});
