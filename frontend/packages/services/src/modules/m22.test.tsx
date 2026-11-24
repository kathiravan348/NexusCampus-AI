import { act, renderHook, waitFor } from "@testing-library/react";
import { useReportCards, useUpdateReportCardStatus } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M22 hooks", () => {
  it("refreshes the list after a confirmed status change", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({ cards: useReportCards(), update: useUpdateReportCardStatus() }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.cards.isSuccess).toBe(true));
    const card = result.current.cards.data!.items.find((row) => row.status === "published")!;
    await act(async () => {
      await result.current.update.mutateAsync({ id: card.id, status: "withdrawn" });
    });
    await waitFor(() =>
      expect(result.current.cards.data?.items.find((row) => row.id === card.id)?.status).toBe(
        "withdrawn",
      ),
    );
  });

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
