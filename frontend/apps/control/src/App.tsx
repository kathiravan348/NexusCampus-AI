import {
  ControlServicesProvider,
  type ControlServicesProviderProps,
} from "@nexus/services/control";
import { ToastProvider } from "@nexus/ui-core";
import { useState, type ReactNode } from "react";
import { RouterProvider } from "react-router";
import { ControlRuntime } from "./app/ControlRuntime";
import { createControlRouter } from "./app/router";

export interface ControlProvidersProps {
  readonly children: ReactNode;
  /** Tests pass a QueryClient factory with retries off. */
  readonly createClient?: ControlServicesProviderProps["createClient"];
}

/** Staff session + data (no persisted cache) → language, theme and texts → toasts. */
export function ControlProviders({ children, createClient }: ControlProvidersProps) {
  return (
    <ControlServicesProvider {...(createClient ? { createClient } : {})}>
      <ControlRuntime>
        <ToastProvider>{children}</ToastProvider>
      </ControlRuntime>
    </ControlServicesProvider>
  );
}

export function App() {
  const [router] = useState(() => createControlRouter());
  return (
    <ControlProviders>
      <RouterProvider router={router} />
    </ControlProviders>
  );
}
