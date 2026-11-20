import type {
  AccessGrant,
  AccessRequest,
  BreakGlassNotice,
  KeyCustody,
  KeyPurpose,
  KeyState,
  KeyStatus,
} from "@nexus/contracts";
import { TENANT, USER } from "./ids";
import { CREATED_AT } from "./tenants";

/** Opaque Nexus Control staff references (D22): provider staff are never tenant people. */
export const PROVIDER_STAFF = {
  morgan: "stf-0042",
  okafor: "stf-0007",
  lindqvist: "stf-0019",
} as const;

export const ACCESS_REQUEST = {
  apexApproved: "acr-ax-0915",
  riversidePending: "acr-rv-0914",
  northbridgeDenied: "acr-nb-0905",
  littleStepsExpired: "acr-ls-0810",
} as const;

export const ACCESS_GRANT = {
  apexActive: "acg-ax-0915",
  littleStepsEnded: "acg-ls-0810",
} as const;

const key = (
  tenantId: string,
  purpose: KeyPurpose,
  custody: KeyCustody,
  status: KeyState,
  rotatedAt: string | null = null,
): KeyStatus => ({
  id: `key-${tenantId.replace(/^ten-/, "")}-${purpose.replace("_", "-")}`,
  tenantId,
  purpose,
  custody,
  status,
  createdAt: CREATED_AT,
  rotatedAt,
});

/** Vault keys: Northbridge holds its own keys (BYOK); its identity key is mid-rotation. */
export const KEY_STATUSES = [
  key(TENANT.littleSteps, "tenant_data", "platform", "active"),
  key(TENANT.riverside, "tenant_data", "platform", "active", "2026-07-01T00:00:00Z"),
  key(TENANT.riverside, "field_health", "platform", "active"),
  key(TENANT.northbridge, "tenant_data", "byok", "active", "2026-06-15T00:00:00Z"),
  key(TENANT.northbridge, "field_identity", "byok", "rotating", "2026-09-15T09:00:00Z"),
  key(TENANT.apex, "tenant_data", "platform", "active"),
  key(TENANT.harmony, "tenant_data", "platform", "active"),
] satisfies readonly KeyStatus[];

/** Provider support requests, one per status the demo needs (V-3). */
export const ACCESS_REQUESTS = [
  {
    id: ACCESS_REQUEST.apexApproved,
    tenantId: TENANT.apex,
    staffRef: PROVIDER_STAFF.morgan,
    staffDisplayName: "A. Morgan (Nexus Support)",
    reason: "Investigate notification templates that fail to render in Arabic.",
    modules: ["M02", "M07"],
    mode: "read",
    durationHours: 48,
    status: "approved",
    requestedAt: "2026-09-15T07:30:00Z",
    decidedAt: "2026-09-15T07:55:00Z",
    decidedBy: USER.axKarthik,
  },
  {
    id: ACCESS_REQUEST.riversidePending,
    tenantId: TENANT.riverside,
    staffRef: PROVIDER_STAFF.morgan,
    staffDisplayName: "A. Morgan (Nexus Support)",
    reason: "Check why the North campus theme does not apply on tablets.",
    modules: ["M03"],
    mode: "read",
    durationHours: 24,
    status: "pending",
    requestedAt: "2026-09-14T16:20:00Z",
    decidedAt: null,
    decidedBy: null,
  },
  {
    id: ACCESS_REQUEST.northbridgeDenied,
    tenantId: TENANT.northbridge,
    staffRef: PROVIDER_STAFF.okafor,
    staffDisplayName: "C. Okafor (Nexus Support)",
    reason: "Repair duplicated user accounts after an SSO change.",
    modules: ["M02"],
    mode: "edit",
    durationHours: 72,
    status: "denied",
    requestedAt: "2026-09-05T13:00:00Z",
    decidedAt: "2026-09-05T15:45:00Z",
    decidedBy: USER.nbRobert,
  },
  {
    // Approved in August; its grant has since run out.
    id: ACCESS_REQUEST.littleStepsExpired,
    tenantId: TENANT.littleSteps,
    staffRef: PROVIDER_STAFF.lindqvist,
    staffDisplayName: "E. Lindqvist (Nexus Support)",
    reason: "Help set up the academic calendar import.",
    modules: ["M01"],
    mode: "edit",
    durationHours: 24,
    status: "expired",
    requestedAt: "2026-08-10T04:00:00Z",
    decidedAt: "2026-08-10T04:30:00Z",
    decidedBy: USER.lsPriya,
  },
] satisfies readonly AccessRequest[];

/** Grants made by approvals. Apex's is active at `DEMO_NOW`; Little Steps' ended. */
export const ACCESS_GRANTS = [
  {
    id: ACCESS_GRANT.apexActive,
    tenantId: TENANT.apex,
    requestId: ACCESS_REQUEST.apexApproved,
    modules: ["M02", "M07"],
    mode: "read",
    startsAt: "2026-09-15T08:00:00Z",
    endsAt: "2026-09-17T08:00:00Z",
    revokedAt: null,
  },
  {
    id: ACCESS_GRANT.littleStepsEnded,
    tenantId: TENANT.littleSteps,
    requestId: ACCESS_REQUEST.littleStepsExpired,
    modules: ["M01"],
    mode: "edit",
    startsAt: "2026-08-10T04:30:00Z",
    endsAt: "2026-08-11T04:30:00Z",
    revokedAt: null,
  },
] satisfies readonly AccessGrant[];

/** Northbridge was told at once about an emergency access during a security incident (V-5). */
export const BREAK_GLASS_NOTICES = [
  {
    id: "bgn-nb-0902",
    tenantId: TENANT.northbridge,
    category: "security_incident",
    approverRefs: [PROVIDER_STAFF.okafor, PROVIDER_STAFF.lindqvist],
    occurredAt: "2026-09-02T03:10:00Z",
    notifiedAt: "2026-09-02T03:12:00Z",
    reportUrl: null,
  },
] satisfies readonly BreakGlassNotice[];
