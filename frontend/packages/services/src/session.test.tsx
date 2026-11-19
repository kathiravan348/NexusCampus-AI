import { enqueueWrite, listOutbox } from "@nexus/offline";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  MOCK_SCENARIO_KEY,
  SESSION_STORAGE_KEY,
  SessionProvider,
  getMockScenario,
  readStoredSession,
  setMockScenario,
  useSession,
} from "./session";
import { freshDb } from "./test-utils";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

function setup() {
  const db = freshDb();
  const Wrapper = ({ children }: { readonly children?: ReactNode }) => (
    <SessionProvider db={db}>{children}</SessionProvider>
  );
  return { db, ...renderHook(() => useSession(), { wrapper: Wrapper }) };
}

describe("session", () => {
  it("signs in and persists the session in sessionStorage", () => {
    const { result } = setup();
    expect(result.current.session).toBeNull();
    act(() => result.current.signIn("t-1", "u-1"));
    expect(result.current.session).toEqual({ tenantId: "t-1", userId: "u-1" });
    expect(readStoredSession()).toEqual({ tenantId: "t-1", userId: "u-1" });
  });

  it("restores a stored session and ignores a broken one", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ tenantId: "t", userId: "u" }));
    expect(setup().result.current.session).toEqual({ tenantId: "t", userId: "u" });
    sessionStorage.setItem(SESSION_STORAGE_KEY, "{not json");
    expect(readStoredSession()).toBeNull();
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ tenantId: "" }));
    expect(readStoredSession()).toBeNull();
  });

  it("signs out and wipes when nothing is pending", async () => {
    const { result } = setup();
    act(() => result.current.signIn("t-1", "u-1"));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.signOut();
    });
    expect(outcome).toEqual({ blocked: false });
    expect(result.current.session).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("refuses sign-out while the outbox holds writes (O-3)", async () => {
    const { result, db } = setup();
    act(() => result.current.signIn("t-1", "u-1"));
    const scope = { tenantId: "t-1", userId: "u-1" };
    await enqueueWrite(db, scope, {
      moduleId: "M04",
      operation: "text.save",
      mergeRule: "lww-audited",
      payload: { key: "common.save" },
    });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.signOut();
    });
    expect(outcome).toEqual({ blocked: true, pending: 1 });
    expect(result.current.session).toEqual(scope);
    expect(await listOutbox(db, scope)).toHaveLength(1);
  });

  it("throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });
});

describe("mock scenario", () => {
  it("stores a known scenario and clears it", () => {
    expect(getMockScenario()).toBeNull();
    setMockScenario("empty");
    expect(getMockScenario()).toBe("empty");
    setMockScenario(null);
    expect(localStorage.getItem(MOCK_SCENARIO_KEY)).toBeNull();
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem(MOCK_SCENARIO_KEY, "chaos");
    expect(getMockScenario()).toBeNull();
  });
});
