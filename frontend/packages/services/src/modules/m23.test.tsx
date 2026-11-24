import { renderHook, waitFor } from "@testing-library/react";
import { useIssuedDocuments } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M23 hooks", () => {
  it("loads and parses all module pages", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => useIssuedDocuments(), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => {
      expect(result.current.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
    });
  });
});
