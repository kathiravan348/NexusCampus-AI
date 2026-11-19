import { getCached } from "@nexus/offline";
import { useQueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiRequestError } from "./client";
import { queryKeys } from "./keys";
import { useTenant } from "./modules/m01";
import { PERSIST_CACHE_KEY, shouldRetry, useLastSynced, useServices } from "./query";
import { setMockScenario, useSession } from "./session";
import { ADMIN, TEACHER, freshDb, signInAs, startMockServer, wrapper } from "./test-utils";

startMockServer();

const adminScope = { tenantId: ADMIN.tenantId, userId: ADMIN.userId };

describe("shouldRetry", () => {
  const err = (status: number) => new ApiRequestError(status, { code: "internal", message: "x" });

  it("never retries a 4xx", () => {
    expect(shouldRetry(0, err(403))).toBe(false);
    expect(shouldRetry(0, err(404))).toBe(false);
  });

  it("retries network errors and 5xx twice", () => {
    expect(shouldRetry(0, err(0))).toBe(true);
    expect(shouldRetry(1, err(500))).toBe(true);
    expect(shouldRetry(2, err(500))).toBe(false);
  });
});

describe("NexusQueryProvider", () => {
  it("gives signed-out screens no scope and keeps scoped queries idle", () => {
    const { result } = renderHook(() => ({ services: useServices(), tenant: useTenant() }), {
      wrapper: wrapper({ db: freshDb() }),
    });
    expect(result.current.services.scope).toBeNull();
    expect(result.current.tenant.fetchStatus).toBe("idle");
  });

  it("reports when a query last synced", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({ tenant: useTenant(), synced: useLastSynced(queryKeys.m01.tenant(adminScope)) }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    expect(result.current.synced).toBeNull();
    await waitFor(() => expect(result.current.tenant.isSuccess).toBe(true));
    expect(result.current.synced).toMatch(/Z$/);
  });

  it("keeps the cache across a QueryClient restart, per user (L1)", async () => {
    const db = freshDb();
    signInAs(ADMIN);
    const first = renderHook(() => useTenant(), { wrapper: wrapper({ db }) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await waitFor(async () =>
      expect(await getCached(db, adminScope, PERSIST_CACHE_KEY)).not.toBeNull(),
    );
    const saved = first.result.current.data;
    first.unmount();

    // The server is now unreachable: the restored cache still answers.
    setMockScenario("offline");
    const second = renderHook(() => useTenant(), { wrapper: wrapper({ db }) });
    await waitFor(() => expect(second.result.current.data).toEqual(saved));
    second.unmount();

    // Another user on the same device never sees it.
    signInAs(TEACHER);
    const other = renderHook(() => useTenant(), { wrapper: wrapper({ db }) });
    await waitFor(() => expect(other.result.current.isError).toBe(true));
    expect(other.result.current.data).toBeUndefined();
  });

  it("leaves no cache behind after sign-out, even with a write still scheduled (O-3)", async () => {
    const db = freshDb();
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({ tenant: useTenant(), session: useSession(), client: useQueryClient() }),
      { wrapper: wrapper({ db, persistThrottleMs: 60 }) },
    );
    await waitFor(() => expect(result.current.tenant.isSuccess).toBe(true));
    await act(() => new Promise((resolve) => setTimeout(resolve, 120)));
    await act(async () => {
      // A cache change schedules a write, then sign-out starts before the throttle fires.
      result.current.client.setQueryData(queryKeys.m02.me(adminScope), { late: true });
      expect(await result.current.session.signOut()).toEqual({ blocked: false });
    });
    // Wait past the throttle: a late write would re-create the wiped cache.
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    expect(await db.cache.count()).toBe(0);
    expect(await getCached(db, adminScope, PERSIST_CACHE_KEY)).toBeNull();
  });

  it("drops a cache persisted by another app version", async () => {
    const db = freshDb();
    signInAs(ADMIN);
    const first = renderHook(() => useTenant(), { wrapper: wrapper({ db, appVersion: "1" }) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await waitFor(async () =>
      expect(await getCached(db, adminScope, PERSIST_CACHE_KEY)).not.toBeNull(),
    );
    first.unmount();

    setMockScenario("offline");
    const second = renderHook(() => useTenant(), { wrapper: wrapper({ db, appVersion: "2" }) });
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    expect(second.result.current.data).toBeUndefined();
  });

  it("surfaces the error scenario as ApiRequestError", async () => {
    signInAs(ADMIN);
    setMockScenario("error");
    const { result } = renderHook(() => useTenant(), { wrapper: wrapper({ db: freshDb() }) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiRequestError);
    expect(result.current.error).toMatchObject({ status: 500 });
  });

  it("throws when a hook is used outside the provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useServices())).toThrow(/NexusQueryProvider/);
    quiet.mockRestore();
  });
});
