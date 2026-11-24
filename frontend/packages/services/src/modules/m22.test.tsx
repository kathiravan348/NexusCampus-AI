import { renderHook, waitFor } from "@testing-library/react";
import { useReportCards } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M22 hooks", () => {
  it("loads and parses all module pages", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => useReportCards(), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => {
      expect(result.current.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
    });
  });
});
