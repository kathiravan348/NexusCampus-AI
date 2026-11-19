import { renderHook, waitFor } from "@testing-library/react";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";
import { useMe } from "./m02";

startMockServer();

describe("m02 hooks", () => {
  it("loads the signed-in user with resolved permissions", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(() => useMe(), { wrapper: wrapper({ db: freshDb() }) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.user.id).toBe(ADMIN.userId);
    expect(result.current.data?.person.id).toBe(result.current.data?.user.personId);
    expect(result.current.data?.permissions).toContain("m05.plan.read");
  });
});
