import { renderHook, waitFor } from "@testing-library/react";
import { useDashboardKpis, useRoleHome } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M28 hooks", () => {
  it("loads the signed-in viewer's home and the tenant KPIs", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({
        home: useRoleHome(),
        kpis: useDashboardKpis(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.home.data).toMatchObject({
        role: "leader",
        learnerIds: [],
        cards: [{ kind: "kpi" }, { kind: "alerts" }],
      });
      expect(result.current.kpis.data?.map((row) => row.code)).toEqual([
        "attendance",
        "collected",
        "outstanding",
        "admissions",
        "learners",
      ]);
    });
  });
});
