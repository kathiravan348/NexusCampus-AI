import {
  LedgerAccountSchema,
  JournalEntrySchema,
  BudgetSchema,
  type JournalEntry,
  type JournalEntryInput,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

const all = { pageSize: PAGE_SIZE_MAX };
const LedgerAccountPage = pageSchema(LedgerAccountSchema);
const JournalEntryPage = pageSchema(JournalEntrySchema);
const BudgetPage = pageSchema(BudgetSchema);

export function useLedgerAccounts() {
  return useScopedQuery(queryKeys.m19.ledgerAccounts, (c, signal) =>
    c.get("/ledger-accounts", LedgerAccountPage, all, { signal }),
  );
}

export function useJournalEntries() {
  return useScopedQuery(queryKeys.m19.journalEntries, (c, signal) =>
    c.get("/journal-entries", JournalEntryPage, all, { signal }),
  );
}

export function useBudgets() {
  return useScopedQuery(queryKeys.m19.budgets, (c, signal) =>
    c.get("/budgets", BudgetPage, all, { signal }),
  );
}

export function useCreateJournalEntry() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<JournalEntry, Error, JournalEntryInput>({
    mutationFn: (body) => client.send("POST", "/journal-entries", body, JournalEntrySchema),
    onSuccess: async () => {
      if (!session) return;
      await qc.invalidateQueries({ queryKey: queryKeys.m19.ledgerAccounts(session).slice(0, -1) });
    },
  });
}
