import type { Campus, Group, Institution, InstitutionType } from "@nexus/contracts";
import { CAMPUS, GROUP, INSTITUTION, TENANT } from "./ids";

/** All fixture records are created and last changed at fixed 2026 instants (deterministic tests). */
export const CREATED_AT = "2026-01-15T09:00:00Z";
export const UPDATED_AT = "2026-08-20T10:30:00Z";

export const GROUPS = [
  {
    id: GROUP.riverside,
    tenantId: TENANT.riverside,
    name: "Riverside Education Group",
    region: "eu",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
] satisfies readonly Group[];

export const INSTITUTIONS = [
  {
    id: INSTITUTION.littleSteps,
    tenantId: TENANT.littleSteps,
    groupId: null,
    name: "Little Steps",
    type: "ey",
    region: "in",
    locale: {
      defaultLocale: "en-IN",
      supportedLocales: ["en-IN"],
      timeZone: "Asia/Kolkata",
      currency: "INR",
      country: "IN",
      weekendDays: [0],
    },
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
  {
    id: INSTITUTION.riversideSchool,
    tenantId: TENANT.riverside,
    groupId: GROUP.riverside,
    name: "Riverside School",
    type: "k12",
    region: "eu",
    locale: {
      defaultLocale: "hi-IN",
      supportedLocales: ["hi-IN", "en-GB"],
      timeZone: "Europe/London",
      currency: "GBP",
      country: "GB",
      weekendDays: [6, 0],
    },
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
  {
    id: INSTITUTION.northbridge,
    tenantId: TENANT.northbridge,
    groupId: null,
    name: "Northbridge University",
    type: "he",
    region: "us",
    locale: {
      defaultLocale: "en-US",
      supportedLocales: ["en-US"],
      timeZone: "America/New_York",
      currency: "USD",
      country: "US",
      weekendDays: [6, 0],
    },
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
  {
    id: INSTITUTION.apex,
    tenantId: TENANT.apex,
    groupId: null,
    name: "Apex Coaching",
    type: "tp",
    region: "in",
    locale: {
      defaultLocale: "ta-IN",
      supportedLocales: ["ta-IN", "en-IN"],
      timeZone: "Asia/Kolkata",
      currency: "INR",
      country: "IN",
      weekendDays: [0],
    },
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
  {
    id: INSTITUTION.harmony,
    tenantId: TENANT.harmony,
    groupId: null,
    name: "Harmony Music Academy",
    type: "sk",
    region: "apac",
    locale: {
      defaultLocale: "en-SG",
      supportedLocales: ["en-SG"],
      timeZone: "Asia/Singapore",
      currency: "SGD",
      country: "SG",
      weekendDays: [0],
    },
    status: "active",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
] satisfies readonly Institution[];

export const CAMPUSES = [
  {
    id: CAMPUS.littleSteps,
    tenantId: TENANT.littleSteps,
    institutionId: INSTITUTION.littleSteps,
    code: "MAIN",
    name: "Little Steps Indiranagar",
    timeZone: null,
    address: {
      line1: "12 Example Lane",
      city: "Bengaluru",
      region: "Karnataka",
      countryCode: "IN",
    },
  },
  {
    id: CAMPUS.riversideNorth,
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
    code: "NORTH",
    name: "Riverside School North",
    timeZone: null,
    address: { line1: "1 Fictional Road", city: "Leeds", postalCode: "LS0 0AA", countryCode: "GB" },
  },
  {
    id: CAMPUS.riversideSouth,
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
    code: "SOUTH",
    name: "Riverside School South",
    timeZone: null,
    address: { line1: "2 Sample Street", city: "Leeds", postalCode: "LS0 0BB", countryCode: "GB" },
  },
  {
    id: CAMPUS.northbridge,
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
    code: "MAIN",
    name: "Northbridge Main Campus",
    timeZone: null,
    address: { line1: "100 College Avenue", city: "Albany", region: "NY", countryCode: "US" },
  },
  {
    id: CAMPUS.apex,
    tenantId: TENANT.apex,
    institutionId: INSTITUTION.apex,
    code: "CHN",
    name: "Apex Coaching Chennai",
    timeZone: null,
    address: {
      line1: "Office 0, Example Tower, Anna Salai",
      city: "Chennai",
      region: "Tamil Nadu",
      postalCode: "600000",
      countryCode: "IN",
    },
  },
  {
    id: CAMPUS.harmony,
    tenantId: TENANT.harmony,
    institutionId: INSTITUTION.harmony,
    code: "MAIN",
    name: "Harmony Music Academy",
    timeZone: null,
    address: { line1: "8 Melody Walk", city: "Singapore", postalCode: "000000", countryCode: "SG" },
  },
] satisfies readonly Campus[];

/** One demo tenant: its type (a group tenant is `grp`), its group if any, institutions and campuses. */
export interface DemoTenant {
  readonly tenantId: string;
  readonly type: InstitutionType;
  readonly name: string;
  readonly group: Group | null;
  readonly institutions: readonly Institution[];
  readonly campuses: readonly Campus[];
}

const tenant = (tenantId: string, type: InstitutionType, name: string): DemoTenant => ({
  tenantId,
  type,
  name,
  group: GROUPS.find((g) => g.tenantId === tenantId) ?? null,
  institutions: INSTITUTIONS.filter((i) => i.tenantId === tenantId),
  campuses: CAMPUSES.filter((c) => c.tenantId === tenantId),
});

/** The 5 demo tenants (D16): EY, a 2-campus K12 school under a group, HE, Arabic RTL TP, SK. */
export const DEMO_TENANTS: readonly DemoTenant[] = [
  tenant(TENANT.littleSteps, "ey", "Little Steps"),
  tenant(TENANT.riverside, "grp", "Riverside Education Group"),
  tenant(TENANT.northbridge, "he", "Northbridge University"),
  tenant(TENANT.apex, "tp", "Apex Coaching"),
  tenant(TENANT.harmony, "sk", "Harmony Music Academy"),
];
