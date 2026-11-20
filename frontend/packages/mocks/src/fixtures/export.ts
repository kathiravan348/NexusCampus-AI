import { AUDIT_EVENTS } from "./audit";
import { ACADEMIC_CALENDARS } from "./calendars";
import { COMPLIANCE_PACKS, CONSENTS, DATA_SUBJECT_REQUESTS, TENANT_COMPLIANCE } from "./compliance";
import { SESSIONS, SSO_PROVIDERS, USERS } from "./identity";
import { PEOPLE } from "./people";
import { ENTITLEMENTS } from "./plans";
import { PERMISSIONS, ROLE_ASSIGNMENTS, ROLES } from "./rbac";
import { GUARDIAN_LINKS, ROLE_PROFILES } from "./role-profiles";
import { ACCESS_GRANTS, ACCESS_REQUESTS, BREAK_GLASS_NOTICES, KEY_STATUSES } from "./vault";
import { FONTS, TEXT_OVERRIDE_REVISIONS, TEXT_OVERRIDES, THEMES } from "./studio";
import { CAMPUSES, DEMO_TENANTS, GROUPS, INSTITUTIONS } from "./tenants";

/** Format version of `demo_fixtures.json`; bump when the shape changes so the backend seed can refuse old files. */
export const DEMO_FIXTURES_VERSION = 11;

/**
 * The demo data the backend seed reads, in contract shapes (camelCase): tenancy (NEX-043) plus each tenant's
 * hash-chained audit log in chain order (NEX-044), identity (NEX-045), RBAC and entitlements (NEX-046), vault keys and provider access (NEX-050/051), privacy (NEX-052), themes and fonts (NEX-053), text overrides (NEX-054), and a `tenants` list with each tenant's region.
 */
export function demoFixtures() {
  return {
    version: DEMO_FIXTURES_VERSION,
    tenants: DEMO_TENANTS.map((t) => ({
      id: t.tenantId,
      name: t.name,
      type: t.type,
      region: t.group?.region ?? t.institutions[0]?.region ?? null,
    })),
    groups: GROUPS,
    institutions: INSTITUTIONS,
    campuses: CAMPUSES,
    calendars: ACADEMIC_CALENDARS,
    auditEvents: AUDIT_EVENTS,
    people: PEOPLE,
    users: USERS,
    roleProfiles: ROLE_PROFILES,
    sessions: SESSIONS,
    permissions: PERMISSIONS,
    roles: ROLES,
    roleAssignments: ROLE_ASSIGNMENTS,
    entitlements: ENTITLEMENTS,
    guardianLinks: GUARDIAN_LINKS,
    ssoProviders: SSO_PROVIDERS,
    keyStatuses: KEY_STATUSES,
    accessRequests: ACCESS_REQUESTS,
    accessGrants: ACCESS_GRANTS,
    breakGlassNotices: BREAK_GLASS_NOTICES,
    consents: CONSENTS,
    themes: THEMES,
    fonts: FONTS,
    textOverrides: TEXT_OVERRIDES,
    textOverrideRevisions: TEXT_OVERRIDE_REVISIONS,
    dataSubjectRequests: DATA_SUBJECT_REQUESTS,
    compliancePacks: COMPLIANCE_PACKS,
    tenantCompliance: Object.entries(TENANT_COMPLIANCE).flatMap(([tenantId, codes]) =>
      codes.map((packCode) => ({ tenantId, packCode })),
    ),
  };
}

/** Stable text (2-space JSON + newline) so the export check can compare files byte for byte. */
export function demoFixturesJson(): string {
  return `${JSON.stringify(demoFixtures(), null, 2)}\n`;
}
