import { AUDIT_EVENTS } from "./audit";
import { ACADEMIC_CALENDARS } from "./calendars";
import { SESSIONS, USERS } from "./identity";
import { PEOPLE } from "./people";
import { ROLE_PROFILES } from "./role-profiles";
import { CAMPUSES, DEMO_TENANTS, GROUPS, INSTITUTIONS } from "./tenants";

/** Format version of `demo_fixtures.json`; bump when the shape changes so the backend seed can refuse old files. */
export const DEMO_FIXTURES_VERSION = 3;

/**
 * The demo data the backend seed reads, in contract shapes (camelCase): tenancy (NEX-043) plus each tenant's
 * hash-chained audit log in chain order (NEX-044), identity (NEX-045), and a `tenants` list with each tenant's region.
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
  };
}

/** Stable text (2-space JSON + newline) so the export check can compare files byte for byte. */
export function demoFixturesJson(): string {
  return `${JSON.stringify(demoFixtures(), null, 2)}\n`;
}
