import { PROVIDER_STAFF } from "../../fixtures/vault";

/**
 * Nexus Control fixture ids (D16, D50). Staff ids reuse the opaque `PROVIDER_STAFF` refs the institution-side
 * demo (M83) already shows, so both sides of an access request tell the same story.
 */
export const STAFF = {
  admin: "stf-0001",
  sales: "stf-0011",
  billing: "stf-0013",
  implementation: "stf-0023",
  release: "stf-0031",
  partnerUser: "stf-0051",
  morgan: PROVIDER_STAFF.morgan,
  okafor: PROVIDER_STAFF.okafor,
  lindqvist: PROVIDER_STAFF.lindqvist,
} as const;

export const ACCOUNT = {
  littleSteps: "acc-ls",
  riverside: "acc-rv",
  northbridge: "acc-nb",
  apex: "acc-ax",
  harmony: "acc-hm",
  coastal: "acc-ct",
  alpine: "acc-al",
  sunrise: "acc-sr",
  lotus: "acc-lt",
  oldMill: "acc-om",
} as const;

export const PARTNER = {
  south: "ptn-south",
  euro: "ptn-euro",
} as const;

export const DEPLOYMENT = {
  inShared: "dep-in-1",
  euShared: "dep-eu-1",
  apacShared: "dep-apac-1",
  northbridge: "dep-us-nb",
  coastal: "dep-ct",
  alpine: "dep-al",
  apexEdge: "dep-edge-ax",
} as const;

export const CATALOGUE = {
  starter: "cat-starter",
  standard: "cat-standard",
  enterprise: "cat-enterprise",
  aiPlus: "cat-ai-plus",
  messaging: "cat-messaging",
  dedicatedCell: "cat-dedicated",
  ai10k: "cat-ai-10k",
  ai50k: "cat-ai-50k",
  licStandard: "cat-lic-standard",
  licEnterprise: "cat-lic-enterprise",
  supportPriority: "cat-support-priority",
} as const;

export const RELEASE = {
  lts: "rel-225",
  v240: "rel-240",
  v241: "rel-241",
  rc: "rel-250-rc1",
  v250: "rel-250",
} as const;

export const TICKET = {
  apexTemplates: "tck-0915",
  riversideTheme: "tck-0914",
  northbridgeSso: "tck-0905",
  littleStepsCalendar: "tck-0810",
  coastalBackup: "tck-0912",
  harmonyBilling: "tck-0915b",
} as const;

/** Mock-only Ed25519 signature: 64 zero bytes, base64. Real signatures come from the control backend. */
export const MOCK_SIGNATURE = `${"A".repeat(86)}==`;
