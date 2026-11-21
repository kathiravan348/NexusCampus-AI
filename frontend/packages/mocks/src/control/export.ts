import { CONTROL_ROLE_PERMISSIONS, STAFF_USERS } from "./fixtures";

/** Bump when the exported shape changes; the control backend seed checks it (NEX-096). */
export const CONTROL_FIXTURES_VERSION = 1;

/**
 * Staff and role permissions for the control backend seed (NEX-096):
 * `pnpm --filter @nexus/mocks export:fixtures` → `backend/src/nexus/control/control_fixtures.json`.
 * The mocks stay the single source of truth; `export.test.ts` fails when the JSON is stale.
 */
export function controlFixturesJson(): string {
  return `${JSON.stringify(
    {
      version: CONTROL_FIXTURES_VERSION,
      staff: STAFF_USERS,
      rolePermissions: CONTROL_ROLE_PERMISSIONS,
    },
    null,
    2,
  )}\n`;
}
