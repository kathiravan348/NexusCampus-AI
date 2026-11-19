import { renderHook, waitFor } from "@testing-library/react";
import { ApiRequestError } from "../client";
import { ADMIN, TEACHER, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import { useEntitlements, usePlan, useUsage } from "./m05";

startMockServer();

describe("m05 hooks", () => {
  it("loads plan, entitlements and usage for an admin", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({ plan: usePlan(), entitlements: useEntitlements(), usage: useUsage() }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => {
      expect(result.current.plan.isSuccess).toBe(true);
      expect(result.current.entitlements.isSuccess).toBe(true);
      expect(result.current.usage.isSuccess).toBe(true);
    });
    expect(result.current.plan.data?.modules.length).toBeGreaterThan(0);
    expect(
      result.current.entitlements.data?.items.every((e) => e.tenantId === ADMIN.tenantId),
    ).toBe(true);
    expect(result.current.usage.data?.items.length).toBeGreaterThan(0);
  });

  it("surfaces a 403 when the role lacks m05.plan.read", async () => {
    signInAs(TEACHER);
    const { result } = renderHook(() => usePlan(), { wrapper: wrapper({ db: freshDb() }) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiRequestError);
    expect(result.current.error).toMatchObject({ status: 403, error: { code: "forbidden" } });
  });
});
