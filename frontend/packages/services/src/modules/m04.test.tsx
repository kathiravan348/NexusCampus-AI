import { renderHook, waitFor } from "@testing-library/react";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import { useTextOverrides } from "./m04";

startMockServer();

describe("m04 hooks", () => {
  it("loads only the asked locale's overrides for this tenant", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => useTextOverrides("en"), {
      wrapper: wrapper({ db: freshDb() }),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const items = result.current.data?.items ?? [];
    expect(items.every((o) => o.locale === "en" && o.tenantId === ADMIN.tenantId)).toBe(true);
    expect(result.current.data?.total).toBe(items.length);
  });
});
