import { DEMO_PERSONAS, type DemoPersona } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { createOfflineDb, type NexusOfflineDB } from "@nexus/offline";
import type { ReactNode } from "react";
import { createNexusQueryClient, NexusQueryProvider } from "./query";
import { SESSION_STORAGE_KEY, SessionProvider } from "./session";

/** Test-only helpers (never exported from the package). */
export { server };

/** Starts the MSW node server for one test file and resets storage between tests. */
export function startMockServer(): void {
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  afterEach(() => {
    server.resetHandlers();
    sessionStorage.clear();
    localStorage.clear();
  });
  afterAll(() => server.close());
}

function persona(index: number): DemoPersona {
  const found = DEMO_PERSONAS[index];
  if (!found) throw new Error(`No demo persona ${index}`);
  return found;
}

/** First demo tenant's admin (every M01–M05 read allowed) and its teacher. */
export const ADMIN = persona(0);
export const TEACHER = persona(1);

export function signInAs(who: DemoPersona): void {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ tenantId: who.tenantId, userId: who.userId }),
  );
}

let dbCount = 0;
export function freshDb(): NexusOfflineDB {
  dbCount += 1;
  return createOfflineDb(`services-test-${dbCount}-${globalThis.crypto.randomUUID()}`);
}

export interface WrapperOptions {
  readonly db: NexusOfflineDB;
  readonly appVersion?: string;
  readonly persistThrottleMs?: number;
}

/** Providers as the app wires them, with retries off and persistence unthrottled. */
export function wrapper({ db, appVersion = "test", persistThrottleMs = 0 }: WrapperOptions) {
  return function Wrapper({ children }: { readonly children?: ReactNode }) {
    return (
      <SessionProvider db={db}>
        <NexusQueryProvider
          appVersion={appVersion}
          mode="mock"
          persistThrottleMs={persistThrottleMs}
          createClient={() =>
            createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          {children}
        </NexusQueryProvider>
      </SessionProvider>
    );
  };
}
