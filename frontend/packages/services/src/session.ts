import { IdSchema } from "@nexus/contracts";
import { createOfflineDb, signOutWipe, type NexusOfflineDB } from "@nexus/offline";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { readCsrfToken } from "./client";
import { API_BASE, DATA_MODE, type DataMode } from "./config";

/** Who is signed in on this tab: the scope of every request, cache entry and outbox write. */
export interface SessionIdentity {
  readonly tenantId: string;
  readonly userId: string;
}

/** O-3: sign-out is refused while unsynced writes (pending, syncing or conflict) remain. */
export type SignOutResult =
  { readonly blocked: false } | { readonly blocked: true; readonly pending: number };

export interface SessionContextValue {
  readonly session: SessionIdentity | null;
  /** False while real mode asks the backend who is signed in (`GET /me`); always true in mock mode. */
  readonly ready: boolean;
  readonly db: NexusOfflineDB;
  /** Mock: pick a demo persona. Real: the arguments are ignored — use `startRealSignIn`. */
  signIn(tenantId: string, userId: string): void;
  /** Real mode: the backend said `401` — forget the session (local data stays until a real sign-out). */
  expire(): void;
  signOut(): Promise<SignOutResult>;
  /** Writers of user data (the query persister) pause before sign-out wipes; returns unregister. */
  registerSignOutGuard(guard: SignOutGuard): () => void;
}

/** Something that writes user data in the background and must stop before a sign-out wipe. */
export interface SignOutGuard {
  /** Stop writing and wait for any write in flight. */
  pause(): Promise<void>;
  /** Sign-out was refused: carry on writing. */
  resume(): void;
}

export const SESSION_STORAGE_KEY = "nexus.session";
export const MOCK_SCENARIO_KEY = "nexus.mockScenario";
export const MOCK_SCENARIOS = ["empty", "error", "slow", "offline"] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

const StoredSessionSchema = z.strictObject({ tenantId: IdSchema, userId: IdSchema });

/** Storage may be missing or blocked (private mode, previews): every access is guarded. */
function storage(kind: "sessionStorage" | "localStorage"): Storage | null {
  try {
    return (globalThis as Partial<Record<typeof kind, Storage>>)[kind] ?? null;
  } catch {
    return null;
  }
}

export function readStoredSession(): SessionIdentity | null {
  try {
    const raw = storage("sessionStorage")?.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = StoredSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: SessionIdentity | null): void {
  try {
    const store = storage("sessionStorage");
    if (session) store?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else store?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Not persisted: the session still lives in memory for this tab.
  }
}

/** Mock mode only: the scenario sent as `X-Nexus-Scenario`, or `null` for normal data. */
export function getMockScenario(): MockScenario | null {
  try {
    const value = storage("localStorage")?.getItem(MOCK_SCENARIO_KEY) ?? null;
    return (MOCK_SCENARIOS as readonly string[]).includes(value ?? "")
      ? (value as MockScenario)
      : null;
  } catch {
    return null;
  }
}

export function setMockScenario(scenario: MockScenario | null): void {
  try {
    const store = storage("localStorage");
    if (scenario) store?.setItem(MOCK_SCENARIO_KEY, scenario);
    else store?.removeItem(MOCK_SCENARIO_KEY);
  } catch {
    // Ignored: scenarios are a demo convenience.
  }
}

let sharedDb: NexusOfflineDB | null = null;
function defaultDb(): NexusOfflineDB {
  sharedDb ??= createOfflineDb();
  return sharedDb;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  readonly children?: ReactNode;
  /** Offline store; defaults to the app's one `nexus-offline` database. */
  readonly db?: NexusOfflineDB;
  readonly mode?: DataMode;
  readonly fetch?: typeof fetch;
}

const RealMeSchema = z.object({ user: z.object({ id: IdSchema, tenantId: IdSchema }) });

/** Real mode: who the session cookie belongs to, from `GET /me`; `null` when signed out. */
export async function fetchRealSession(
  doFetch: typeof fetch = fetch,
): Promise<SessionIdentity | null> {
  try {
    const response = await doFetch(`${API_BASE}/me`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const parsed = RealMeSchema.safeParse(await response.json());
    return parsed.success
      ? { tenantId: parsed.data.user.tenantId, userId: parsed.data.user.id }
      : null;
  } catch {
    return null;
  }
}

/** Real mode: hand over to the backend's Keycloak sign-in; it comes back to `returnTo` (a path in this app). */
export function startRealSignIn(returnTo = "/"): void {
  const target = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  globalThis.location.assign(`${API_BASE}/auth/login?returnTo=${encodeURIComponent(target)}`);
}

async function realSignOut(doFetch: typeof fetch): Promise<void> {
  const csrf = readCsrfToken();
  try {
    await doFetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
    });
  } catch {
    // Offline: the cookie expires on its own; local data is already wiped.
  }
}

export function SessionProvider({
  children,
  db,
  mode = DATA_MODE,
  fetch: doFetch,
}: SessionProviderProps) {
  const offlineDb = useMemo(() => db ?? defaultDb(), [db]);
  const real = mode === "real";
  const [session, setSession] = useState<SessionIdentity | null>(() =>
    real ? null : readStoredSession(),
  );
  const [ready, setReady] = useState(!real);
  const fetcher = useMemo(
    () => doFetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args)),
    [doFetch],
  );

  useEffect(() => {
    if (!real) return;
    let live = true;
    void fetchRealSession(fetcher).then((found) => {
      if (!live) return;
      setSession(found);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [real, fetcher]);

  const expire = useCallback(() => setSession(null), []);

  const signIn = useCallback(
    (tenantId: string, userId: string) => {
      if (real) {
        startRealSignIn("/");
        return;
      }
      const next = { tenantId, userId };
      writeStoredSession(next);
      setSession(next);
    },
    [real],
  );

  const guards = useRef(new Set<SignOutGuard>());
  const registerSignOutGuard = useCallback((guard: SignOutGuard) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);

  const signOut = useCallback(async (): Promise<SignOutResult> => {
    if (session) {
      // Stop and drain cache writers first, or a late write would re-create the wiped data (O-3).
      const active = [...guards.current];
      await Promise.all(active.map((guard) => guard.pause()));
      const result = await signOutWipe(offlineDb, session);
      if (!result.wiped) {
        active.forEach((guard) => guard.resume());
        return { blocked: true, pending: result.pendingCount + result.conflictCount };
      }
    }
    if (real) await realSignOut(fetcher);
    else writeStoredSession(null);
    setSession(null);
    return { blocked: false };
  }, [offlineDb, session, real, fetcher]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, ready, db: offlineDb, signIn, expire, signOut, registerSignOutGuard }),
    [session, ready, offlineDb, signIn, expire, signOut, registerSignOutGuard],
  );
  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
