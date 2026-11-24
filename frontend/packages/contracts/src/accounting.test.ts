import { describe, expect, it } from "vitest";
import {
  BudgetSchema,
  JournalEntrySchema,
  LedgerAccountSchema,
  type Budget,
  type JournalEntry,
  type LedgerAccount,
} from "./index";

const scope = { tenantId: "tenant-school", institutionId: "institution-school" };
const timestamps = { createdAt: "2026-04-01T08:00:00Z", updatedAt: "2026-04-02T08:00:00Z" };
const cashAccount: LedgerAccount = {
  ...scope,
  id: "acct-1010",
  code: "1010",
  name: "Operating Bank Account",
  kind: "asset",
  parentId: "acct-1000",
  active: true,
};
const tuitionIncomeAccount: LedgerAccount = {
  ...scope,
  id: "acct-4010",
  code: "4010",
  name: "Tuition Fee Income",
  kind: "income",
  parentId: null,
  active: true,
};
const taxPayableAccount: LedgerAccount = {
  ...scope,
  id: "acct-2100",
  code: "2100",
  name: "GST Payable",
  kind: "liability",
  parentId: null,
  active: true,
};
const balancedJournalEntry: JournalEntry = {
  ...scope,
  id: "je-2026-0001",
  postedOn: "2026-04-05",
  reference: "RCPT-2026-0001",
  currency: "INR",
  lines: [
    { accountId: cashAccount.id, debit: 2_396_000, credit: 0 },
    { accountId: tuitionIncomeAccount.id, debit: 0, credit: 2_360_000 },
    { accountId: taxPayableAccount.id, debit: 0, credit: 36_000 },
  ],
  source: "fees",
  createdAt: "2026-04-05T10:35:00Z",
};
const approvedBudget: Budget = {
  ...scope,
  ...timestamps,
  id: "budget-2026",
  academicYearId: "calendar-2026",
  currency: "INR",
  lines: [
    { accountId: tuitionIncomeAccount.id, amount: 50_000_000 },
    { accountId: taxPayableAccount.id, amount: 1_500_000 },
  ],
  status: "approved",
};

describe("LedgerAccount", () => {
  it("accepts valid accounts with 3 to 10 digit codes", () => {
    expect(LedgerAccountSchema.parse(cashAccount)).toEqual(cashAccount);
    expect(LedgerAccountSchema.parse(tuitionIncomeAccount)).toEqual(tuitionIncomeAccount);
    const minCode = { ...tuitionIncomeAccount, code: "100" };
    const maxCode = { ...tuitionIncomeAccount, code: "1234567890" };
    expect(LedgerAccountSchema.parse(minCode)).toEqual(minCode);
    expect(LedgerAccountSchema.parse(maxCode)).toEqual(maxCode);
  });

  it.each(["12", "12345678901", "100A", "10-10", ""])("rejects code %j", (code) => {
    expect(LedgerAccountSchema.safeParse({ ...cashAccount, code }).success).toBe(false);
  });

  it("rejects self-parented accounts", () => {
    const row = { ...cashAccount, parentId: cashAccount.id };
    expect(LedgerAccountSchema.safeParse(row).success).toBe(false);
  });
});

describe("JournalEntry", () => {
  it("accepts a balanced journal entry", () => {
    expect(JournalEntrySchema.parse(balancedJournalEntry)).toEqual(balancedJournalEntry);
  });

  it("rejects a line with both debit and credit or both zero", () => {
    const bothPositive = {
      ...balancedJournalEntry,
      lines: [
        { accountId: cashAccount.id, debit: 1000, credit: 500 },
        { accountId: tuitionIncomeAccount.id, debit: 0, credit: 500 },
      ],
    };
    const bothZero = {
      ...balancedJournalEntry,
      lines: [
        { accountId: cashAccount.id, debit: 1000, credit: 0 },
        { accountId: tuitionIncomeAccount.id, debit: 0, credit: 1000 },
        { accountId: taxPayableAccount.id, debit: 0, credit: 0 },
      ],
    };
    expect(JournalEntrySchema.safeParse(bothPositive).success).toBe(false);
    expect(JournalEntrySchema.safeParse(bothZero).success).toBe(false);
  });

  it("rejects an unbalanced entry, single-line entry and float amounts", () => {
    const unbalanced = {
      ...balancedJournalEntry,
      lines: [
        { accountId: cashAccount.id, debit: 1000, credit: 0 },
        { accountId: tuitionIncomeAccount.id, debit: 0, credit: 900 },
      ],
    };
    const singleLine = {
      ...balancedJournalEntry,
      lines: [{ accountId: cashAccount.id, debit: 1000, credit: 0 }],
    };
    const floatAmounts = {
      ...balancedJournalEntry,
      lines: [
        { accountId: cashAccount.id, debit: 100.5, credit: 0 },
        { accountId: tuitionIncomeAccount.id, debit: 0, credit: 100.5 },
      ],
    };
    expect(JournalEntrySchema.safeParse(unbalanced).success).toBe(false);
    expect(JournalEntrySchema.safeParse(singleLine).success).toBe(false);
    expect(JournalEntrySchema.safeParse(floatAmounts).success).toBe(false);
  });
});

describe("Budget", () => {
  it("accepts an approved budget and draft/closed budgets", () => {
    expect(BudgetSchema.parse(approvedBudget)).toEqual(approvedBudget);
    const draft = { ...approvedBudget, status: "draft" as const };
    const closed = { ...approvedBudget, status: "closed" as const };
    expect(BudgetSchema.parse(draft)).toEqual(draft);
    expect(BudgetSchema.parse(closed)).toEqual(closed);
  });

  it("rejects duplicate budget accounts and float or negative amounts", () => {
    const duplicateAccounts = {
      ...approvedBudget,
      lines: [
        { accountId: tuitionIncomeAccount.id, amount: 1_000_000 },
        { accountId: tuitionIncomeAccount.id, amount: 2_000_000 },
      ],
    };
    const floatLine = {
      ...approvedBudget,
      lines: [{ accountId: tuitionIncomeAccount.id, amount: 125.5 }],
    };
    const negativeLine = {
      ...approvedBudget,
      lines: [{ accountId: tuitionIncomeAccount.id, amount: -1 }],
    };
    expect(BudgetSchema.safeParse(duplicateAccounts).success).toBe(false);
    expect(BudgetSchema.safeParse(floatLine).success).toBe(false);
    expect(BudgetSchema.safeParse(negativeLine).success).toBe(false);
  });

  it("compares updatedAt and createdAt instants with fractional seconds", () => {
    const createdAt = "2026-04-01T08:00:00.000Z";
    const sameInstant = { ...approvedBudget, createdAt, updatedAt: "2026-04-01T08:00:00Z" };
    const earlier = { ...approvedBudget, createdAt, updatedAt: "2026-04-01T07:59:59.999Z" };
    expect(BudgetSchema.safeParse(sameInstant).success).toBe(true);
    expect(BudgetSchema.safeParse(earlier).success).toBe(false);
  });
});

const allRecords = [
  { name: "LedgerAccount", schema: LedgerAccountSchema, row: cashAccount },
  { name: "JournalEntry", schema: JournalEntrySchema, row: balancedJournalEntry },
  { name: "Budget", schema: BudgetSchema, row: approvedBudget },
];

it.each(allRecords)("$name rejects extra keys and requires tenantId", ({ schema, row }) => {
  expect(schema.safeParse({ ...row, extra: true }).success).toBe(false);
  expect(schema.safeParse({ ...row, tenantId: undefined }).success).toBe(false);
});
