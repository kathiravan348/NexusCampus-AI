import { DEMO_PERSONAS, TENANT } from "@nexus/mocks";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NO_PERSIST, shouldPersistQuery } from "../query";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import {
  useAuditEvents,
  useCompliancePacks,
  useConsents,
  useDataRequests,
  useUpdateDataRequest,
} from "./m06";

startMockServer();

const AX_ADMIN = DEMO_PERSONAS.find(
  (p) => p.tenantId === TENANT.apex && p.labelKey === "m02.persona.admin",
)!;

describe("m06 hooks", () => {
  it("filters the audit log by action", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({
        all: useAuditEvents({}, 1, 50),
        invited: useAuditEvents({ action: "m02.user.invited" }, 1, 50),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.invited.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.all.isSuccess).toBe(true));
    const invited = result.current.invited.data!.items;
    expect(invited.length).toBeGreaterThan(0);
    expect(invited.every((e) => e.action === "m02.user.invited")).toBe(true);
    expect(result.current.all.data!.total).toBeGreaterThan(invited.length);
  });

  it("loads consents and compliance packs", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => ({ c: useConsents(), p: useCompliancePacks() }), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() =>
      expect(result.current.c.isSuccess && result.current.p.isSuccess).toBe(true),
    );
    expect(result.current.c.data!.items.length).toBeGreaterThan(0);
    expect(result.current.p.data!.items.map((p) => p.code)).toEqual(["dpdp"]);
  });

  it("moves a data request a step and refetches the list", async () => {
    signInAs(AX_ADMIN);
    const { result } = renderHook(
      () => ({ list: useDataRequests(), update: useUpdateDataRequest() }),
      {
        wrapper: wrapper({ db: freshDb() }),
      },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(() =>
      result.current.update.mutateAsync({ id: "dsr-ax-correct", data: { status: "in_progress" } }),
    );
    await waitFor(() =>
      expect(result.current.list.data!.items.find((r) => r.id === "dsr-ax-correct")!.status).toBe(
        "in_progress",
      ),
    );
  });

  it("keeps NO_PERSIST queries out of the persisted cache", () => {
    const qc = new QueryClient();
    qc.setQueryData(["a"], 1);
    qc.getQueryCache().build(qc, { queryKey: ["b"], meta: NO_PERSIST });
    qc.setQueryData(["b"], 2);
    const [a, b] = [
      qc.getQueryCache().find({ queryKey: ["a"] })!,
      qc.getQueryCache().find({ queryKey: ["b"] })!,
    ];
    expect(shouldPersistQuery(a)).toBe(true);
    expect(shouldPersistQuery(b)).toBe(false);
  });
});
