import { z } from "zod";
import {
  CurrencyCodeSchema,
  IdSchema,
  IsoDateSchema,
  MinorUnitsSchema,
  NameSchema,
  UtcDateTimeSchema,
} from "./common";

/**
 * M19 Accounting contracts (D9).
 * Country tax rules, bank reconciliation and ERP export are server / later work.
 */

const NonNegativeMinorUnitsSchema = MinorUnitsSchema.min(0);

const timestamps = {
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
};
const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

/** Numeric chart-of-accounts code (3 to 10 digits), unique per institution on the server. */
export const LedgerAccountCodeSchema = z.string().regex(/^\d{3,10}$/, {
  message: "Must be a 3 to 10 digit account code",
});
export type LedgerAccountCode = z.infer<typeof LedgerAccountCodeSchema>;

export const LedgerAccountKindSchema = z.enum([
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);
export type LedgerAccountKind = z.infer<typeof LedgerAccountKindSchema>;

/** One account in an institution's chart of accounts. */
export const LedgerAccountSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    code: LedgerAccountCodeSchema,
    name: NameSchema,
    kind: LedgerAccountKindSchema,
    parentId: IdSchema.nullable(),
    active: z.boolean(),
  })
  .refine((account) => account.parentId !== account.id, {
    message: "parentId cannot equal id",
    path: ["parentId"],
  });
export type LedgerAccount = z.infer<typeof LedgerAccountSchema>;

export const JournalSourceSchema = z.enum(["manual", "fees", "payroll", "import"]);
export type JournalSource = z.infer<typeof JournalSourceSchema>;

function hasSingleSideAmount(line: { debit: number; credit: number }): boolean {
  const hasDebit = line.debit > 0;
  const hasCredit = line.credit > 0;
  return hasDebit !== hasCredit;
}

export const JournalLineSchema = z
  .strictObject({
    accountId: IdSchema,
    debit: NonNegativeMinorUnitsSchema,
    credit: NonNegativeMinorUnitsSchema,
  })
  .refine(hasSingleSideAmount, {
    message: "exactly one of debit or credit must be greater than 0",
    path: ["credit"],
  });
export type JournalLine = z.infer<typeof JournalLineSchema>;

function isBalancedJournalEntry(entry: { lines: readonly JournalLine[] }): boolean {
  const debitTotal = entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const creditTotal = entry.lines.reduce((sum, line) => sum + line.credit, 0);
  return debitTotal === creditTotal;
}

const journalEntryFields = {
  institutionId: IdSchema,
  postedOn: IsoDateSchema,
  reference: z.string().trim().min(1).max(60),
  currency: CurrencyCodeSchema,
  lines: z.array(JournalLineSchema).min(2).max(100),
};
const balancedEntryIssue = {
  message: "M19 journal entry must have matching debit and credit totals",
  path: ["lines"],
};

export const JournalEntryInputSchema = z
  .strictObject(journalEntryFields)
  .refine(isBalancedJournalEntry, balancedEntryIssue);
export type JournalEntryInput = z.infer<typeof JournalEntryInputSchema>;

export const JournalEntrySchema = z
  .strictObject({
    ...journalEntryFields,
    id: IdSchema,
    tenantId: IdSchema,
    source: JournalSourceSchema,
    createdAt: UtcDateTimeSchema,
  })
  .refine(isBalancedJournalEntry, balancedEntryIssue);
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const BudgetStatusSchema = z.enum(["draft", "approved", "closed"]);
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const BudgetLineSchema = z.strictObject({
  accountId: IdSchema,
  amount: NonNegativeMinorUnitsSchema,
});
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

function hasUniqueBudgetAccounts(budget: { lines: readonly BudgetLine[] }): boolean {
  return new Set(budget.lines.map((line) => line.accountId)).size === budget.lines.length;
}

/** Academic-year budget across distinct ledger accounts in one currency. */
export const BudgetSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    academicYearId: IdSchema,
    currency: CurrencyCodeSchema,
    lines: z.array(BudgetLineSchema).min(1).max(200),
    status: BudgetStatusSchema,
    ...timestamps,
  })
  .refine(hasUniqueBudgetAccounts, {
    message: "budget lines have duplicate accountId",
    path: ["lines"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Budget = z.infer<typeof BudgetSchema>;
