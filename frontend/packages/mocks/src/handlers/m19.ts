import {
  BudgetSchema,
  JournalEntrySchema,
  LedgerAccountSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { get, list } from "./route";

const M = { module: "M19", permission: "m19.accounts.read" } as const;

export const m19Handlers = [
  get("/ledger-accounts", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.ledgerAccounts, ctx.viewer.tenantId),
      pageSchema(LedgerAccountSchema),
    ),
  ),
  get("/journal-entries", M, (ctx) =>
    list(ctx, ofTenant(mockDb.journalEntries, ctx.viewer.tenantId), pageSchema(JournalEntrySchema)),
  ),
  get("/budgets", M, (ctx) =>
    list(ctx, ofTenant(mockDb.budgets, ctx.viewer.tenantId), pageSchema(BudgetSchema)),
  ),
];
