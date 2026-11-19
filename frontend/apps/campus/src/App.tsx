import type { NexusOfflineDB } from "@nexus/offline";
import { NexusQueryProvider, SessionProvider, type NexusQueryProviderProps } from "@nexus/services";
import { ToastProvider } from "@nexus/ui-core";
import { useState, type ReactNode } from "react";
import { RouterProvider } from "react-router";
import pkg from "../package.json";
import { createAppRouter } from "./app/router";
import { TenantRuntime } from "./app/TenantRuntime";

export interface AppProvidersProps {
  readonly children: ReactNode;
  /** Tests pass their own offline store and QueryClient factory. */
  readonly db?: NexusOfflineDB;
  readonly createClient?: NexusQueryProviderProps["createClient"];
}

/** Session → data (persisted cache) → tenant theme/locale/texts → toasts. */
export function AppProviders({ children, db, createClient }: AppProvidersProps) {
  return (
    <SessionProvider {...(db ? { db } : {})}>
      <NexusQueryProvider appVersion={pkg.version} {...(createClient ? { createClient } : {})}>
        <TenantRuntime>
          <ToastProvider>{children}</ToastProvider>
        </TenantRuntime>
      </NexusQueryProvider>
    </SessionProvider>
  );
}

export function App() {
  const [router] = useState(() => createAppRouter());
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
