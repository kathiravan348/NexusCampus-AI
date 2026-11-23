import * as C from "@nexus/contracts";
import type { z } from "zod";
import { AI_CREDITS, AI_SETTINGS, ASSIST_ANSWERS } from "./ai";
import { AUDIT_EVENTS } from "./audit";
import { ACADEMIC_CALENDARS } from "./calendars";
import { COMPLIANCE_PACKS, CONSENTS, DATA_SUBJECT_REQUESTS } from "./compliance";
import { SESSIONS, SSO_PROVIDERS, USERS } from "./identity";
import {
  NOTIFICATION_DELIVERIES,
  NOTIFICATION_PREFERENCES,
  NOTIFICATION_TEMPLATES,
} from "./notifications";
import { PEOPLE } from "./people";
import { ENTITLEMENTS, PLANS, USAGE_METERS } from "./plans";
import { INSTITUTION_TYPE_PROFILES } from "./profiles";
import { PERMISSIONS, ROLE_ASSIGNMENTS, ROLES } from "./rbac";
import { ROLE_PROFILES } from "./role-profiles";
import { FONTS, TEXT_OVERRIDE_REVISIONS, TEXT_OVERRIDES, THEMES } from "./studio";
import { DEVICE_SYNCS, SYNC_CONFLICTS } from "./sync";
import { CAMPUSES, GROUPS, INSTITUTIONS } from "./tenants";
import { INSTALLS } from "./install";
import { ACCESS_GRANTS, ACCESS_REQUESTS, BREAK_GLASS_NOTICES, KEY_STATUSES } from "./vault";

const DOMAIN_EVENT = {
  eventId: "evt-0001",
  tenantId: "ten-ls",
  moduleId: "M02",
  eventType: "m02.user.invited",
  occurredAt: "2026-09-01T08:00:00Z",
  actorId: "usr-ls-priya",
  correlationId: "corr-0001",
  schemaVersion: 1,
  payload: { userId: "usr-ls-new" },
};
const API_ERROR = {
  error: {
    code: "not_found",
    message: "Not found.",
    details: [{ path: "id", message: "Unknown id" }],
  },
};

/**
 * Contracts the backend serves, with demo rows as valid samples (NEX-059). The backend test maps each name to its
 * Pydantic model; `docs/CONTRACTS.md` names the rest "frontend only".
 */
const CONTRACTS: readonly (readonly [string, z.ZodType, readonly unknown[]])[] = [
  ["ApiError", C.ApiErrorSchema, [API_ERROR]],
  ["DomainEvent", C.DomainEventSchema, [DOMAIN_EVENT]],
  ["LocaleSettings", C.LocaleSettingsSchema, INSTITUTIONS.map((i) => i.locale)],
  ["Group", C.GroupSchema, GROUPS],
  ["Institution", C.InstitutionSchema, INSTITUTIONS],
  ["Campus", C.CampusSchema, CAMPUSES],
  ["InstitutionTypeProfile", C.InstitutionTypeProfileSchema, INSTITUTION_TYPE_PROFILES],
  ["AcademicCalendar", C.AcademicCalendarSchema, ACADEMIC_CALENDARS],
  ["Person", C.PersonSchema, PEOPLE],
  ["RoleProfile", C.RoleProfileSchema, ROLE_PROFILES],
  ["User", C.UserSchema, USERS],
  ["Session", C.SessionSchema, SESSIONS],
  ["SsoProvider", C.SsoProviderSchema, SSO_PROVIDERS],
  ["Permission", C.PermissionSchema, PERMISSIONS],
  ["Role", C.RoleSchema, ROLES],
  ["RoleAssignment", C.RoleAssignmentSchema, ROLE_ASSIGNMENTS],
  ["Theme", C.ThemeSchema, THEMES],
  ["Font", C.FontSchema, FONTS],
  ["TextOverride", C.TextOverrideSchema, TEXT_OVERRIDES],
  ["TextOverrideRevision", C.TextOverrideRevisionSchema, TEXT_OVERRIDE_REVISIONS],
  ["Plan", C.PlanSchema, PLANS],
  ["Entitlement", C.EntitlementSchema, ENTITLEMENTS],
  ["UsageMeter", C.UsageMeterSchema, USAGE_METERS],
  ["AuditEvent", C.AuditEventSchema, AUDIT_EVENTS],
  ["Consent", C.ConsentSchema, CONSENTS],
  ["DataSubjectRequest", C.DataSubjectRequestSchema, DATA_SUBJECT_REQUESTS],
  ["CompliancePack", C.CompliancePackSchema, COMPLIANCE_PACKS],
  ["NotificationTemplate", C.NotificationTemplateSchema, NOTIFICATION_TEMPLATES],
  ["NotificationDelivery", C.NotificationDeliverySchema, NOTIFICATION_DELIVERIES],
  ["NotificationPreference", C.NotificationPreferenceSchema, NOTIFICATION_PREFERENCES],
  ["DeviceSync", C.DeviceSyncSchema, DEVICE_SYNCS],
  ["SyncConflict", C.SyncConflictSchema, SYNC_CONFLICTS],
  ["AiSettings", C.AiSettingsSchema, AI_SETTINGS],
  ["AiCredit", C.AiCreditSchema, AI_CREDITS],
  ["AssistAnswer", C.AssistAnswerSchema, ASSIST_ANSWERS],
  ["KeyStatus", C.KeyStatusSchema, KEY_STATUSES],
  ["AccessRequest", C.AccessRequestSchema, ACCESS_REQUESTS],
  ["AccessGrant", C.AccessGrantSchema, ACCESS_GRANTS],
  ["BreakGlassNotice", C.BreakGlassNoticeSchema, BREAK_GLASS_NOTICES],
  [
    "DiagnosticBundle",
    C.DiagnosticBundleSchema,
    Object.values(INSTALLS).flatMap((i) => i.diagnostics),
  ],
  [
    "DiagnosticContent",
    C.DiagnosticContentSchema,
    Object.values(INSTALLS).flatMap((i) =>
      Object.entries(i.diagnosticContent).map(([id, content]) => ({ id, content })),
    ),
  ],
];

/** Contracts with no backend response model of their own (`docs/CONTRACTS.md`: "frontend only"). */
export const FRONTEND_ONLY = ["TerminologyPack", "Page", "PageQuery"] as const;

type Json = Record<string, unknown>;

export type ParityContractEntry = readonly [string, z.ZodType, readonly unknown[]];

function mutations(row: Json): Json[] {
  const out: Json[] = [{ ...row, unexpectedField: 1 }];
  for (const [key, value] of Object.entries(row)) {
    const rest = Object.fromEntries(Object.entries(row).filter(([k]) => k !== key));
    out.push(rest, { ...row, [key]: null });
    if (typeof value === "string") out.push({ ...row, [key]: 12345 });
    else if (typeof value === "number") out.push({ ...row, [key]: "12345" });
    else if (typeof value === "boolean") out.push({ ...row, [key]: "yes" });
    else if (Array.isArray(value)) out.push({ ...row, [key]: "not-a-list" });
    else if (value !== null && typeof value === "object") out.push({ ...row, [key]: [] });
  }
  return out;
}

/**
 * Valid demo rows (up to 3) and generated invalid variants of the first, each with Zod's verdict: `valid`, and
 * `shapeValid` = no issue other than a cross-field rule (`custom`).
 */
export function buildParitySamples(contracts: readonly ParityContractEntry[]) {
  return contracts.map(([name, schema, rows]) => {
    const first = rows[0] as Json;
    const samples = [...rows.slice(0, 3), ...mutations(first)].map((sample) => {
      const result = schema.safeParse(sample);
      const shapeValid = result.success || result.error.issues.every((i) => i.code === "custom");
      return { sample, valid: result.success, shapeValid };
    });
    return { contract: name, samples };
  });
}

/** Written to `backend/tests/parity/samples.json` (NEX-059). */
export function paritySamples() {
  return buildParitySamples(CONTRACTS);
}

export function paritySamplesJson(): string {
  return `${JSON.stringify({ frontendOnly: FRONTEND_ONLY, contracts: paritySamples() }, null, 2)}\n`;
}
