import {
  ACCOUNT_CONTACTS,
  ACCOUNT_NOTES,
  ACCOUNTS,
  CATALOGUE_ITEMS,
  CONTRACTS,
  CONTROL_ROLE_PERMISSIONS,
  CREDIT_NOTES,
  DEPLOYMENTS,
  DUNNING_STATES,
  HEALTH_SIGNALS,
  INVOICES,
  LICENCES,
  OPPORTUNITIES,
  PARTNERS,
  PAYMENTS,
  QUOTES,
  RELEASES,
  ROLLOUTS,
  STAFF_USERS,
  SUBSCRIPTIONS,
  USAGE_RECORDS,
} from "./fixtures";

/** Bump when the exported shape changes; the control backend seed checks it (NEX-096). */
export const CONTROL_FIXTURES_VERSION = 6;

/**
 * Staff, role permissions (NEX-096) and the account data P01 reads (NEX-101) for the control backend seed:
 * `pnpm --filter @nexus/mocks export:fixtures` → `backend/src/nexus/control/control_fixtures.json`.
 * The mocks stay the single source of truth; `export.test.ts` fails when the JSON is stale.
 */
export function controlFixturesJson(): string {
  return `${JSON.stringify(
    {
      version: CONTROL_FIXTURES_VERSION,
      staff: STAFF_USERS,
      rolePermissions: CONTROL_ROLE_PERMISSIONS,
      partners: PARTNERS,
      accounts: ACCOUNTS,
      contacts: ACCOUNT_CONTACTS,
      opportunities: OPPORTUNITIES,
      contracts: CONTRACTS,
      notes: ACCOUNT_NOTES,
      catalogue: CATALOGUE_ITEMS,
      quotes: QUOTES,
      subscriptions: SUBSCRIPTIONS,
      invoices: INVOICES,
      payments: PAYMENTS,
      creditNotes: CREDIT_NOTES,
      dunning: DUNNING_STATES,
      usage: USAGE_RECORDS,
      licences: LICENCES,
      deployments: DEPLOYMENTS,
      healthSignals: HEALTH_SIGNALS,
      releases: RELEASES,
      rollouts: ROLLOUTS,
    },
    null,
    2,
  )}\n`;
}
