import { describe, expect, it } from "vitest";
import { PersonSchema, RoleProfileKindSchema, RoleProfileSchema } from "./person";

const person = {
  id: "per_asha",
  tenantId: "ten_riverside_group",
  legalName: "Asha Rao",
  preferredName: "Asha",
  dateOfBirth: "1988-04-12",
  isMinor: false,
  email: "asha.rao@example.edu",
  phone: "+919876543210",
  preferredLocale: "en-IN",
  retentionState: "active",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-11-19T04:30:00Z",
};

const profile = {
  id: "rp_asha_staff",
  tenantId: "ten_riverside_group",
  personId: "per_asha",
  institutionId: "inst_riverside",
  campusId: "cmp_north",
  kind: "staff",
  academicYearId: "ay_2026",
  effectiveFrom: "2026-06-01",
  effectiveTo: null,
  status: "active",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: object[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("Person", () => {
  it("accepts an adult and a minor with no contact details", () => {
    expect(PersonSchema.safeParse(person).success).toBe(true);
    expect(
      PersonSchema.safeParse({
        ...person,
        id: "per_kiran",
        legalName: "Kiran Rao",
        preferredName: null,
        dateOfBirth: "2018-02-03",
        isMinor: true,
        email: null,
        phone: null,
        preferredLocale: null,
      }).success,
    ).toBe(true);
  });

  it("rejects bad phone, email, locale, retention state, times and extra keys", () => {
    rejects(PersonSchema, [
      { ...person, phone: "9876543210" },
      { ...person, phone: "+91 98765 43210" },
      { ...person, email: "asha" },
      { ...person, preferredLocale: "en_IN" },
      { ...person, retentionState: "deleted" },
      { ...person, dateOfBirth: "12/04/1988" },
      { ...person, legalName: "  " },
      { ...person, updatedAt: "2026-05-01T00:00:00Z" },
      { ...person, password: "x" },
    ]);
  });
});

describe("RoleProfile", () => {
  it("accepts open-ended and closed memberships of every kind", () => {
    expect(RoleProfileSchema.safeParse(profile).success).toBe(true);
    for (const kind of RoleProfileKindSchema.options)
      expect(
        RoleProfileSchema.safeParse({
          ...profile,
          kind,
          campusId: null,
          academicYearId: null,
          effectiveTo: "2027-05-31",
        }).success,
      ).toBe(true);
    expect(
      RoleProfileSchema.safeParse({ ...profile, effectiveTo: profile.effectiveFrom }).success,
    ).toBe(true);
  });

  it("rejects effectiveTo before effectiveFrom, bad enums and extra keys", () => {
    rejects(RoleProfileSchema, [
      { ...profile, effectiveTo: "2026-05-31" },
      { ...profile, kind: "teacher" },
      { ...profile, status: "deleted" },
      { ...profile, effectiveFrom: "2026-06-01T00:00:00Z" },
      { ...profile, updatedAt: "2026-05-01T00:00:00Z" },
      { ...profile, role: "admin" },
    ]);
  });
});
