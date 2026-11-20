import { DEMO_PERSONAS, TENANT, type DemoPersona } from "@nexus/mocks";
import { createOfflineDb, type NexusOfflineDB } from "@nexus/offline";
import { createNexusQueryClient, SESSION_STORAGE_KEY } from "@nexus/services";
import { render } from "@testing-library/react";
import { Users, Ban } from "lucide-react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { AppProviders } from "../App";
import type { ModuleEntry } from "../app/modules";
import { appRoutes } from "../app/router";
import { LOCALE_STORAGE_KEY } from "../app/TenantRuntime";

/** Test-only module screens: M02 people (needs `m02.user.read`) and M99 (never entitled). */
export const TEST_MODULES: readonly ModuleEntry[] = [
  {
    moduleId: "M02",
    path: "people",
    navKey: "m02.persona.user",
    summaryKey: "m02.nav.summary",
    icon: Users,
    permission: "m02.user.read",
    offlineLevel: "L1",
    load: () => Promise.resolve({ default: () => <p>people screen</p> }),
  },
  {
    moduleId: "M99",
    path: "unplanned",
    navKey: "common.details",
    summaryKey: "common.details",
    icon: Ban,
    permission: null,
    offlineLevel: "L1",
    load: () => Promise.resolve({ default: () => <p>unplanned screen</p> }),
  },
];

export function persona(tenantId: string, role: string): DemoPersona {
  const found = DEMO_PERSONAS.find(
    (p) => p.tenantId === tenantId && p.labelKey === `m02.persona.${role}`,
  );
  if (!found) throw new Error(`No ${role} persona for ${tenantId}`);
  return found;
}

export const ADMINS = Object.values(TENANT).map((tenantId) => persona(tenantId, "admin"));

export function signInAs(who: DemoPersona): void {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ tenantId: who.tenantId, userId: who.userId }),
  );
}

/**
 * Drop the English pick test/setup makes, so Riverside opens in Hindi and Apex in Tamil (D42): for one
 * tenant, or for all when no tenant is given.
 */
export function withInstitutionLocale(tenantId?: string): void {
  if (tenantId === undefined) {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    return;
  }
  const picks = JSON.parse(localStorage.getItem(LOCALE_STORAGE_KEY) ?? "{}") as Record<
    string,
    string
  >;
  delete picks[tenantId];
  localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(picks));
}

let count = 0;
export function freshDb(): NexusOfflineDB {
  count += 1;
  return createOfflineDb(`campus-test-${count}-${globalThis.crypto.randomUUID()}`);
}

export interface RenderAppOptions {
  readonly as?: DemoPersona;
  readonly modules?: readonly ModuleEntry[];
  readonly db?: NexusOfflineDB;
}

/** The whole app (providers + routes) at `path`, optionally signed in. */
export function renderApp(path: string, options: RenderAppOptions = {}) {
  if (options.as) signInAs(options.as);
  const db = options.db ?? freshDb();
  const router = createMemoryRouter(appRoutes(options.modules ?? TEST_MODULES), {
    initialEntries: [path],
  });
  const view = render(
    <AppProviders
      db={db}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, db };
}
