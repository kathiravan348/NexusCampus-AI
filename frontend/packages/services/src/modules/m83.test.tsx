import { ACCESS_GRANT, ACCESS_REQUEST, DEMO_PERSONAS, TENANT } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import {
  useAccessGrants,
  useAccessRequests,
  useDecideAccessRequest,
  useGrantHistory,
  useKeyStatus,
  useRevokeGrant,
} from "./m83";

startMockServer();

const owner = (tenantId: string) =>
  DEMO_PERSONAS.find((p) => p.tenantId === tenantId && p.labelKey === "m02.persona.admin")!;

describe("m83 hooks", () => {
  it("approves a pending request, then revokes the new grant", async () => {
    signInAs(owner(TENANT.riverside));
    const { result } = renderHook(
      () => ({
        requests: useAccessRequests(),
        grants: useAccessGrants(),
        decide: useDecideAccessRequest(),
        revoke: useRevokeGrant(),
        keys: useKeyStatus(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.requests.isSuccess).toBe(true));
    expect(result.current.keys.isPending || result.current.keys.isSuccess).toBe(true);
    await act(() =>
      result.current.decide.mutateAsync({
        id: ACCESS_REQUEST.riversidePending,
        decision: "approve",
        scope: { modules: ["M03"], mode: "read", durationHours: 4 },
      }),
    );
    await waitFor(() => expect(result.current.grants.data?.items.length).toBe(1));
    const grant = result.current.grants.data!.items[0]!;
    await act(() => result.current.revoke.mutateAsync(grant.id));
    await waitFor(() => expect(result.current.grants.data!.items[0]!.revokedAt).not.toBeNull());
  });

  it("lists what a grant did from the audit log", async () => {
    signInAs(owner(TENANT.apex));
    const { result } = renderHook(() => useGrantHistory(ACCESS_GRANT.apexActive), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.items.length).toBeGreaterThan(0);
    expect(result.current.data!.items.every((e) => e.grantId === ACCESS_GRANT.apexActive)).toBe(
      true,
    );
  });
});
