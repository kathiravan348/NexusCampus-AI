import { describe, expect, it } from "vitest";
import {
  CampusSchema,
  GroupSchema,
  InstitutionSchema,
  InstitutionTypeProfileSchema,
  LocaleSettingsSchema,
} from "./tenancy";

const locale = {
  defaultLocale: "en-IN",
  supportedLocales: ["en-IN", "hi-IN"],
  timeZone: "Asia/Kolkata",
  currency: "INR",
  country: "IN",
  weekendDays: [0],
};

const institution = {
  id: "inst_riverside",
  tenantId: "ten_riverside_group",
  groupId: "grp_riverside",
  name: "Riverside School",
  type: "k12",
  region: "in",
  locale,
  status: "active",
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-11-19T04:30:00Z",
};

describe("LocaleSettings", () => {
  it("accepts valid settings, including an Arabic school with a Friday–Saturday weekend", () => {
    expect(LocaleSettingsSchema.safeParse(locale).success).toBe(true);
    expect(
      LocaleSettingsSchema.safeParse({
        defaultLocale: "ar-AE",
        supportedLocales: ["ar-AE", "en-AE"],
        timeZone: "Asia/Dubai",
        currency: "AED",
        country: "AE",
        weekendDays: [5, 6],
      }).success,
    ).toBe(true);
  });

  it("rejects a default locale that is not supported, duplicates, and bad codes", () => {
    const cases = [
      { ...locale, supportedLocales: ["hi-IN"] },
      { ...locale, supportedLocales: ["en-IN", "en-IN"] },
      { ...locale, weekendDays: [0, 0] },
      { ...locale, weekendDays: [7] },
      { ...locale, defaultLocale: "en_IN", supportedLocales: ["en_IN"] },
      { ...locale, timeZone: "Mars/Phobos" },
      { ...locale, currency: "XYZ" },
      { ...locale, country: "in" },
      { ...locale, extra: true },
    ];
    for (const c of cases)
      expect(LocaleSettingsSchema.safeParse(c).success, JSON.stringify(c)).toBe(false);
  });
});

describe("Group and Institution", () => {
  it("accept valid records; a standalone institution has no group", () => {
    expect(
      GroupSchema.safeParse({
        id: "grp_riverside",
        tenantId: "ten_riverside_group",
        name: "Riverside Education Group",
        region: "in",
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      }).success,
    ).toBe(true);
    expect(InstitutionSchema.safeParse(institution).success).toBe(true);
    expect(InstitutionSchema.safeParse({ ...institution, groupId: null }).success).toBe(true);
  });

  it("reject unknown types and statuses, updatedAt before createdAt, and extra keys", () => {
    expect(InstitutionSchema.safeParse({ ...institution, type: "school" }).success).toBe(false);
    expect(InstitutionSchema.safeParse({ ...institution, status: "deleted" }).success).toBe(false);
    expect(
      InstitutionSchema.safeParse({ ...institution, updatedAt: "2026-05-01T00:00:00Z" }).success,
    ).toBe(false);
    expect(
      InstitutionSchema.safeParse({
        ...institution,
        createdAt: "2026-06-01T00:00:00.500Z",
        updatedAt: "2026-06-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      InstitutionSchema.safeParse({
        ...institution,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00.500Z",
      }).success,
    ).toBe(true);
    expect(InstitutionSchema.safeParse({ ...institution, plan: "gold" }).success).toBe(false);
    const group = {
      id: "grp_riverside",
      tenantId: "ten_riverside_group",
      name: "Riverside Education Group",
      region: "in",
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-01T00:00:00Z",
    };
    expect(GroupSchema.safeParse({ ...group, updatedAt: "2026-05-01T00:00:00Z" }).success).toBe(
      false,
    );
    expect(GroupSchema.safeParse({ ...group, extra: true }).success).toBe(false);
  });
});

describe("Campus", () => {
  const campus = {
    id: "cmp_north",
    tenantId: "ten_riverside_group",
    institutionId: "inst_riverside",
    code: "RS-NORTH",
    name: "North Campus",
    timeZone: null,
    address: {
      line1: "12 River Road",
      city: "Pune",
      region: "Maharashtra",
      postalCode: "411001",
      countryCode: "IN",
    },
  };

  it("accepts a campus with or without its own time zone", () => {
    expect(CampusSchema.safeParse(campus).success).toBe(true);
    expect(CampusSchema.safeParse({ ...campus, timeZone: "Asia/Kolkata" }).success).toBe(true);
  });

  it("rejects bad codes and addresses", () => {
    expect(CampusSchema.safeParse({ ...campus, code: "north campus" }).success).toBe(false);
    expect(
      CampusSchema.safeParse({ ...campus, address: { ...campus.address, countryCode: "India" } })
        .success,
    ).toBe(false);
    expect(
      CampusSchema.safeParse({ ...campus, address: { ...campus.address, city: "" } }).success,
    ).toBe(false);
    expect(CampusSchema.safeParse({ ...campus, extra: true }).success).toBe(false);
  });
});

describe("InstitutionTypeProfile", () => {
  const profile = {
    type: "ey",
    defaultModules: ["M01", "M02", "M37"],
    structure: "rolling",
    gradingScheme: "gs_ey_descriptors",
    terminologyPack: "ey",
  };

  it("accepts a valid profile", () => {
    expect(InstitutionTypeProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("rejects a foreign terminology pack, duplicate or invalid modules, and no modules", () => {
    expect(
      InstitutionTypeProfileSchema.safeParse({ ...profile, terminologyPack: "he" }).success,
    ).toBe(false);
    expect(
      InstitutionTypeProfileSchema.safeParse({ ...profile, defaultModules: ["M01", "M01"] })
        .success,
    ).toBe(false);
    expect(
      InstitutionTypeProfileSchema.safeParse({ ...profile, defaultModules: ["M1"] }).success,
    ).toBe(false);
    expect(InstitutionTypeProfileSchema.safeParse({ ...profile, defaultModules: [] }).success).toBe(
      false,
    );
    expect(InstitutionTypeProfileSchema.safeParse({ ...profile, extra: true }).success).toBe(false);
  });
});
