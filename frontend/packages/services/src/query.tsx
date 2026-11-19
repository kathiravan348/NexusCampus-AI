import {
  deleteCached,
  getCached,
  setCached,
  type NexusOfflineDB,
  type OfflineScope,
} from "@nexus/offline";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
  type QueryClientConfig,
  type QueryKey,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ApiClient, ApiRequestError } from "./client";
import { DATA_MODE, type DataMode } from "./config";
import type { KeyScope } from "./keys";
import { getMockScenario, useSession, type SessionIdentity, type SignOutGuard } from "./session";

/** Cache key of the whole persisted query client inside the user's encrypted L1 store. */
export const PERSIST_CACHE_KEY = "nexus.query-client";
/** Persisted data older than this is dropped on restore. */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 4xx answers never change on retry; network errors and 5xx get two more tries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && error.status > 0 && error.status < 500) return false;
  return failureCount < 2;
}

export function createNexusQueryClient(config?: QueryClientConfig): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config?.defaultOptions,
      queries: {
        retry: shouldRetry,
        gcTime: PERSIST_MAX_AGE_MS,
        ...config?.defaultOptions?.queries,
      },
      mutations: { retry: false, ...config?.defaultOptions?.mutations },
    },
  });
}

/** A persister that sign-out can pause before it wipes the user's data. */
export interface OfflinePersister extends Persister, SignOutGuard {}

/** Query-cache persister on `@nexus/offline` (encrypted, scoped to one tenant + user). */
export function createOfflinePersister(
  db: NexusOfflineDB,
  scope: OfflineScope,
  throttleMs = 1000,
): OfflinePersister {
  let latest: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  let inflight: Promise<void> = Promise.resolve();
  const write = (): Promise<void> => {
    timer = null;
    if (paused || !latest) return inflight;
    const client = latest;
    latest = null;
    // Writes run one at a time and re-check `paused`, so none lands after a sign-out wipe (O-3).
    inflight = inflight.then(async () => {
      if (!paused) await setCached(db, scope, PERSIST_CACHE_KEY, client);
    });
    return inflight;
  };
  const schedule = (): Promise<void> | undefined => {
    if (throttleMs <= 0) return write();
    timer ??= setTimeout(() => void write().catch(() => undefined), throttleMs);
    return undefined;
  };
  return {
    persistClient(client) {
      latest = client;
      if (!paused) return schedule();
    },
    async pause() {
      paused = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await inflight.catch(() => undefined);
    },
    resume() {
      paused = false;
      if (latest) void schedule()?.catch(() => undefined);
    },
    async restoreClient() {
      const entry = await getCached<PersistedClient>(db, scope, PERSIST_CACHE_KEY);
      return entry?.data;
    },
    async removeClient() {
      await deleteCached(db, scope, PERSIST_CACHE_KEY);
    },
  };
}

export interface ServicesContextValue {
  readonly client: ApiClient;
  readonly scope: KeyScope | null;
  readonly db: NexusOfflineDB;
}

const ServicesContext = createContext<ServicesContextValue | null>(null);

export function useServices(): ServicesContextValue {
  const value = useContext(ServicesContext);
  if (!value) throw new Error("useServices must be used inside <NexusQueryProvider>");
  return value;
}

export interface NexusQueryProviderProps {
  readonly children?: ReactNode;
  /** Persisted caches from another app version are dropped (`buster`). */
  readonly appVersion: string;
  readonly mode?: DataMode;
  /** Builds the QueryClient for each signed-in scope (tests turn off retry delays here). */
  readonly createClient?: () => QueryClient;
  readonly persistThrottleMs?: number;
}

/** One QueryClient per signed-in user; its cache is persisted encrypted in IndexedDB (L1, O-1). */
export function NexusQueryProvider({
  children,
  appVersion,
  mode = DATA_MODE,
  createClient = createNexusQueryClient,
  persistThrottleMs,
}: NexusQueryProviderProps) {
  const { session, db, registerSignOutGuard } = useSession();
  const tenantId = session?.tenantId ?? null;
  const userId = session?.userId ?? null;
  const scope = useMemo<SessionIdentity | null>(
    () => (tenantId !== null && userId !== null ? { tenantId, userId } : null),
    [tenantId, userId],
  );

  const queryClient = useMemo(
    () => createClient(),
    // A new client per user, so nothing cached for one person reaches the next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope],
  );
  const services = useMemo<ServicesContextValue>(
    () => ({
      client: new ApiClient({ mode, identity: () => scope, scenario: getMockScenario }),
      scope,
      db,
    }),
    [mode, scope, db],
  );
  const persister = useMemo(
    () => (scope ? createOfflinePersister(db, scope, persistThrottleMs) : null),
    [db, scope, persistThrottleMs],
  );
  useEffect(() => {
    if (!persister) return;
    const unregister = registerSignOutGuard(persister);
    // A replaced persister (user switch, unmount) never writes again.
    return () => {
      unregister();
      void persister.pause();
    };
  }, [persister, registerSignOutGuard]);

  const inner = <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
  if (!persister) return <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, buster: appVersion, maxAge: PERSIST_MAX_AGE_MS }}
    >
      {inner}
    </PersistQueryClientProvider>
  );
}

/** A query for the signed-in user; disabled (never fetched) while signed out. */
export function useScopedQuery<T>(
  key: (scope: KeyScope) => QueryKey,
  fetch: (client: ApiClient, signal: AbortSignal) => Promise<T>,
  enabled = true,
): UseQueryResult<T, Error> {
  const { client, scope } = useServices();
  return useQuery({
    queryKey: scope ? key(scope) : ["signed-out"],
    queryFn: ({ signal }) => fetch(client, signal),
    enabled: scope !== null && enabled,
  });
}

/** When this query's data last came from the server (UTC ISO), for the "last synced" label; `null` = never. */
export function useLastSynced(queryKey: QueryKey): string | null {
  const queryClient = useQueryClient();
  const hash = JSON.stringify(queryKey);
  const subscribe = useCallback(
    (notify: () => void) => queryClient.getQueryCache().subscribe(notify),
    [queryClient],
  );
  const updatedAt = useSyncExternalStore(subscribe, () => {
    return queryClient.getQueryState(JSON.parse(hash) as QueryKey)?.dataUpdatedAt ?? 0;
  });
  return updatedAt > 0 ? new Date(updatedAt).toISOString() : null;
}
