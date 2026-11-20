import type {
  CompliancePack,
  CompliancePackCode,
  Consent,
  ConsentPurpose,
  ConsentStatus,
  DataSubjectRequest,
  DsrKind,
  DsrStatus,
} from "@nexus/contracts";
import { PERSON, TENANT, USER } from "./ids";

/**
 * The demo clock for ops fixtures (M06, M07, M10, M11, M83): "now" is mid-September 2026, inside the
 * usage period of `USAGE_METERS`. Overdue requests and active grants are relative to this instant.
 */
export const DEMO_NOW = "2026-09-15T12:00:00Z";

export const COMPLIANCE_PACKS = [
  {
    code: "dpdp",
    region: "in",
    dsrDueDays: 30,
    minorAgeThreshold: 18,
    guardianConsentForAi: true,
    guardianConsentForMedia: true,
    retentionDaysDefault: 1095,
  },
  {
    code: "uk_gdpr",
    region: "eu",
    dsrDueDays: 30,
    minorAgeThreshold: 13,
    guardianConsentForAi: true,
    guardianConsentForMedia: true,
    retentionDaysDefault: 2190,
  },
  {
    code: "ferpa",
    region: "us",
    dsrDueDays: 45,
    minorAgeThreshold: 18,
    guardianConsentForAi: false,
    guardianConsentForMedia: false,
    retentionDaysDefault: 1825,
  },
  {
    code: "coppa",
    region: "us",
    dsrDueDays: 30,
    minorAgeThreshold: 13,
    guardianConsentForAi: true,
    guardianConsentForMedia: true,
    retentionDaysDefault: 365,
  },
  {
    code: "pdpa",
    region: "apac",
    dsrDueDays: 30,
    minorAgeThreshold: 13,
    guardianConsentForAi: true,
    guardianConsentForMedia: true,
    retentionDaysDefault: 1825,
  },
  {
    code: "gdpr",
    region: "eu",
    dsrDueDays: 30,
    minorAgeThreshold: 18,
    guardianConsentForAi: true,
    guardianConsentForMedia: true,
    retentionDaysDefault: 1825,
  },
] satisfies readonly CompliancePack[];

/** Which compliance packs each demo tenant follows (no contract field yet; services join on it). */
export const TENANT_COMPLIANCE: Readonly<Record<string, readonly CompliancePackCode[]>> = {
  [TENANT.littleSteps]: ["dpdp"],
  [TENANT.riverside]: ["uk_gdpr"],
  [TENANT.northbridge]: ["ferpa", "coppa"],
  [TENANT.apex]: ["dpdp"],
  [TENANT.harmony]: ["pdpa"],
};

const consent = (
  tenantId: string,
  learnerPersonId: string,
  guardianPersonId: string,
  purpose: ConsentPurpose,
  status: ConsentStatus,
  recordedAt: string,
  withdrawnAt: string | null = null,
): Consent => ({
  id: `cns-${learnerPersonId.replace(/^per-/, "")}-${purpose.replace("_", "-")}`,
  tenantId,
  personId: learnerPersonId,
  purpose,
  status,
  givenByPersonId: guardianPersonId,
  method: status === "pending" ? "in_app" : "digital_signature",
  recordedAt,
  withdrawnAt,
});

const LS = TENANT.littleSteps;
const RV = TENANT.riverside;

/** EY and K12 guardians consenting for minors: AI granted; one media consent withdrawn, one pending. */
export const CONSENTS = [
  consent(LS, PERSON.lsKavya, PERSON.lsArjun, "ai_features", "granted", "2026-06-02T05:30:00Z"),
  consent(LS, PERSON.lsRohan, PERSON.lsSunita, "ai_features", "granted", "2026-06-02T06:10:00Z"),
  consent(LS, PERSON.lsIshaan, PERSON.lsSunita, "ai_features", "granted", "2026-06-02T06:12:00Z"),
  consent(LS, PERSON.lsAnaya, PERSON.lsDeepak, "ai_features", "granted", "2026-06-03T04:45:00Z"),
  consent(
    LS,
    PERSON.lsKavya,
    PERSON.lsArjun,
    "media_sharing",
    "withdrawn",
    "2026-06-02T05:31:00Z",
    "2026-09-08T11:20:00Z",
  ),
  consent(RV, PERSON.rvOliver, PERSON.rvGrace, "ai_features", "granted", "2026-09-01T18:00:00Z"),
  consent(RV, PERSON.rvMia, PERSON.rvGrace, "ai_features", "granted", "2026-09-01T18:02:00Z"),
  consent(RV, PERSON.rvLeo, PERSON.rvAmira, "ai_features", "granted", "2026-09-02T07:40:00Z"),
  consent(RV, PERSON.rvElla, PERSON.rvDaniel, "ai_features", "granted", "2026-09-03T19:15:00Z"),
  consent(RV, PERSON.rvLeo, PERSON.rvAmira, "media_sharing", "pending", "2026-09-10T08:00:00Z"),
] satisfies readonly Consent[];

const DAY_MS = 86_400_000;
const plusDays = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * DAY_MS).toISOString().replace(".000Z", "Z");

const dsr = (
  id: string,
  tenantId: string,
  personId: string,
  kind: DsrKind,
  status: DsrStatus,
  receivedAt: string,
  dueDays: number,
  handledBy: string | null,
  completedAt: string | null = null,
): DataSubjectRequest => ({
  id,
  tenantId,
  personId,
  kind,
  status,
  receivedAt,
  dueAt: plusDays(receivedAt, dueDays),
  completedAt,
  handledBy,
});

/** One request of each kind; `dueAt` uses the strictest deadline of the tenant's packs. Apex's correction is overdue at `DEMO_NOW`. */
export const DATA_SUBJECT_REQUESTS = [
  dsr(
    "dsr-rv-access",
    RV,
    PERSON.rvGrace,
    "access",
    "completed",
    "2026-08-03T09:00:00Z",
    30,
    USER.rvHelen,
    "2026-08-21T15:30:00Z",
  ),
  dsr(
    "dsr-nb-export",
    TENANT.northbridge,
    PERSON.nbJordan,
    "export",
    "in_progress",
    "2026-09-04T14:00:00Z",
    30,
    USER.nbRobert,
  ),
  dsr(
    "dsr-ax-correct",
    TENANT.apex,
    PERSON.axLakshmi,
    "correct",
    "received",
    "2026-08-10T06:00:00Z",
    30,
    null,
  ),
  dsr(
    "dsr-hm-delete",
    TENANT.harmony,
    PERSON.hmMarcus,
    "delete",
    "rejected",
    "2026-07-20T02:00:00Z",
    30,
    USER.hmWeiLing,
    "2026-07-28T03:00:00Z",
  ),
] satisfies readonly DataSubjectRequest[];
