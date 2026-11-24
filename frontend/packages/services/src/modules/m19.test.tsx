import { act, renderHook, waitFor } from "@testing-library/react";
import { useBudgets, useCreateJournalEntry, useJournalEntries, useLedgerAccounts } from "../index";
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

it("refreshes the tenant's journal after an entitlement-protected write", async () => {
  signInAs(ADMIN);
  const { result } = renderHook(() => ({
    entries: useJournalEntries(), accounts: useLedgerAccounts(), create: useCreateJournalEntry(),
  }), { wrapper: wrapper({ db: freshDb() }) });
  await waitFor(() => expect(result.current.accounts.data?.items.length).toBeGreaterThan(0));
  const records = result.current.accounts.data!.items;
  const first = records.find((row) => row.active)!;
  const next = records.find((row) => row.active && row.id !== first.id && row.institutionId === first.institutionId)!;
  await act(async () => {
    await result.current.create.mutateAsync({
      institutionId: first.institutionId,
      postedOn: "2026-11-24",
      reference: "Weekly review",
      currency: "USD",
      lines: [
        { accountId: first.id, debit: 250, credit: 0 },
        { accountId: next.id, debit: 0, credit: 250 },
      ],
    });
  });
  await waitFor(() => expect(result.current.entries.data?.items.some(
    (item) => item.id === result.current.create.data?.id,
  )).toBe(true));
});
