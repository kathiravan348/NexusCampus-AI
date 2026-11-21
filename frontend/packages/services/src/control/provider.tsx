import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiClient } from "../client";
import { DATA_MODE, type DataMode } from "../config";
import { createNexusQueryClient } from "../query";
import { getMockScenario } from "../session";

/** Nexus Control API base (D50); the mock serves it in mock mode, the control backend later. */
export const CONTROL_API_BASE = "/control/api/v1";
/** Mock staff sign-in header (real mode: the control backend's staff SSO + MFA session cookie). */
export const CONTROL_STAFF_HEADER = "X-Nexus-Staff";
/** Demo staff id for this tab only (sessionStorage) — closing the tab signs out. */
export const CONTROL_STAFF_KEY = "nexus.control.staff";

export interface ControlServicesValue {
  readonly client: ApiClient;
  readonly mode: DataMode;
  /** Signed-in demo staff id (mock mode), or `null`. */
  readonly staffId: string | null;
  readonly signIn: (staffId: string) => void;
  readonly signOut: () => void;
}

const ControlServicesContext = createContext<ControlServicesValue | null>(null);

function readStoredStaff(): string | null {
  try {
    return sessionStorage.getItem(CONTROL_STAFF_KEY);
  } catch {
    return null;
  }
}

function storeStaff(staffId: string | null): void {
  try {
    if (staffId === null) sessionStorage.removeItem(CONTROL_STAFF_KEY);
    else sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  } catch {
    // Storage blocked (private window): the session lasts until reload.
  }
}

export interface ControlServicesProviderProps {
  readonly children: ReactNode;
  readonly mode?: DataMode;
  /** Tests pass their own client factory (e.g. retries off). */
  readonly createClient?: () => QueryClient;
  readonly fetch?: typeof fetch;
}

/**
 * Data layer of the Control app. Unlike campus there is **no persisted cache**: provider records never land in
 * browser storage (D53), and switching or signing out clears every cached answer.
 */
export function ControlServicesProvider({
  children,
  mode = DATA_MODE,
  createClient = createNexusQueryClient,
  fetch: fetchImpl,
}: ControlServicesProviderProps) {
  const [queryClient] = useState(createClient);
  const [staffId, setStaffId] = useState<string | null>(readStoredStaff);
  const staffRef = useRef(staffId);
  staffRef.current = staffId;

  const client = useMemo(
    () =>
      new ApiClient({
        mode,
        baseUrl: CONTROL_API_BASE,
        identity: () => null,
        scenario: getMockScenario,
        mockHeaders: (): Record<string, string> =>
          staffRef.current ? { [CONTROL_STAFF_HEADER]: staffRef.current } : {},
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
      }),
    [mode, fetchImpl],
  );

  const signIn = useCallback(
    (id: string) => {
      queryClient.clear();
      storeStaff(id);
      staffRef.current = id;
      setStaffId(id);
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    queryClient.clear();
    storeStaff(null);
    staffRef.current = null;
    setStaffId(null);
  }, [queryClient]);

  const value = useMemo(
    () => ({ client, mode, staffId, signIn, signOut }),
    [client, mode, staffId, signIn, signOut],
  );

  return (
    <ControlServicesContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ControlServicesContext.Provider>
  );
}

export function useControlServices(): ControlServicesValue {
  const value = useContext(ControlServicesContext);
  if (!value) throw new Error("useControlServices must be used inside ControlServicesProvider");
  return value;
}
