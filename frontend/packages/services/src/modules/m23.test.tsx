import { resetMockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useIssuedDocuments, useRevokeIssuedDocument } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => {
  resetMockDb();
});

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

  it("posts a revocation and invalidates cached document queries", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => {
        const all = useIssuedDocuments();
        const first = all.data?.items[0];
        const filtered = useIssuedDocuments(first?.learnerId ?? null);
        const revoke = useRevokeIssuedDocument(first?.id ?? "");
        return { all, filtered, revoke };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.all.isSuccess).toBe(true));
    const target = result.current.all.data!.items.find((row) => !row.revoked)!;
    await waitFor(() => expect(result.current.filtered.isSuccess).toBe(true));

    await act(async () => {
      await result.current.revoke.mutateAsync({ reason: "Superseded by a reissued copy" });
    });

    await waitFor(() => {
      const fromAll = result.current.all.data?.items.find((row) => row.id === target.id);
      const fromFiltered = result.current.filtered.data?.items.find((row) => row.id === target.id);
      expect(fromAll?.revoked).toBe(true);
      expect(fromAll?.revokedReason).toBe("Superseded by a reissued copy");
      expect(fromFiltered?.revoked).toBe(true);
    });
  });
});
