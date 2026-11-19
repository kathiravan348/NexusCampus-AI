import { IdSchema } from "@nexus/contracts";
import { createOfflineDb, signOutWipe, type NexusOfflineDB } from "@nexus/offline";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";

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
  readonly db: NexusOfflineDB;
  signIn(tenantId: string, userId: string): void;
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
}

export function SessionProvider({ children, db }: SessionProviderProps) {
  const offlineDb = useMemo(() => db ?? defaultDb(), [db]);
  const [session, setSession] = useState<SessionIdentity | null>(readStoredSession);

  const signIn = useCallback((tenantId: string, userId: string) => {
    const next = { tenantId, userId };
    writeStoredSession(next);
    setSession(next);
  }, []);

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
    writeStoredSession(null);
    setSession(null);
    return { blocked: false };
  }, [offlineDb, session]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, db: offlineDb, signIn, signOut, registerSignOutGuard }),
    [session, offlineDb, signIn, signOut, registerSignOutGuard],
  );
  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
