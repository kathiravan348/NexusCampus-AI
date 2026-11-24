import { renderHook, waitFor } from "@testing-library/react";
import { useBudgets, useJournalEntries, useLedgerAccounts } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M19 hooks", () => {
  it("loads and parses all module pages", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({
        accounts: useLedgerAccounts(),
        entries: useJournalEntries(),
        budgets: useBudgets(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.accounts.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.entries.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.budgets.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
    });
  });
});
