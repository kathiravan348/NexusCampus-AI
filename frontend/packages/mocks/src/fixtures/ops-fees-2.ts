import type { Budget, JournalEntry, LedgerAccount } from "@nexus/contracts";
import { CALENDAR, INSTITUTION, TENANT } from "./ids";
import { BUDGET, JOURNAL_ENTRY, LEDGER_ACCOUNT, type OpsTenantSlug } from "./ids-stage3";
import { CREATED_AT, INSTITUTIONS, UPDATED_AT } from "./tenants";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

type AccountingSpec = readonly [
  slug: OpsTenantSlug,
  prefix: string,
  tenantId: string,
  institutionId: string,
  academicYearId: string,
  annualTuition: number,
  annualActivity: number,
];

const T = TENANT;
const I = INSTITUTION;
const C = CALENDAR;

const ACCOUNTING_SPECS: readonly AccountingSpec[] = [
  ["ls", "LS", T.littleSteps, I.littleSteps, C.littleSteps, 1_200_000, 200_000],
  ["rv", "RV", T.riverside, I.riversideSchool, C.riversideSchool, 240_000, 40_000],
  ["nb", "NB", T.northbridge, I.northbridge, C.northbridge, 600_000, 100_000],
  ["ax", "AX", T.apex, I.apex, C.apex, 800_000, 120_000],
  ["hm", "HM", T.harmony, I.harmony, C.harmony, 180_000, 20_000],
];

const built = ACCOUNTING_SPECS.map(
  ([slug, prefix, tenantId, institutionId, academicYearId, annualTuition, annualActivity]) => {
    const institution = INSTITUTIONS.find((i) => i.id === institutionId);
    if (!institution) throw new Error(`Missing institution for ${tenantId}`);
    const currency = institution.locale.currency;
    const instalmentTotal = (annualTuition + annualActivity) / 2;
    const activityHalf = annualActivity / 2;
    const [cashAccId, incomeAccId, expenseAccId] = LEDGER_ACCOUNT[slug];

    const ledgerAccounts: LedgerAccount[] = [
      {
        id: cashAccId,
        tenantId,
        institutionId,
        code: "1010",
        name: "Cash and Bank",
        kind: "asset",
        parentId: null,
        active: true,
      },
      {
        id: incomeAccId,
        tenantId,
        institutionId,
        code: "4010",
        name: "Tuition Income",
        kind: "income",
        parentId: null,
        active: true,
      },
      {
        id: expenseAccId,
        tenantId,
        institutionId,
        code: "5010",
        name: "Instructional Supplies",
        kind: "expense",
        parentId: null,
        active: true,
      },
    ];

    const [jrnOneId, jrnTwoId] = JOURNAL_ENTRY[slug];
    const journalEntries: JournalEntry[] = [
      {
        id: jrnOneId,
        tenantId,
        institutionId,
        postedOn: "2026-09-12",
        reference: `${prefix}-JRN-001`,
        currency,
        lines: [
          { accountId: cashAccId, debit: instalmentTotal, credit: 0 },
          { accountId: incomeAccId, debit: 0, credit: instalmentTotal },
        ],
        source: "fees",
        createdAt: "2026-09-12T10:20:00Z",
      },
      {
        id: jrnTwoId,
        tenantId,
        institutionId,
        postedOn: "2026-10-02",
        reference: `${prefix}-JRN-002`,
        currency,
        lines: [
          { accountId: expenseAccId, debit: activityHalf, credit: 0 },
          { accountId: cashAccId, debit: 0, credit: activityHalf },
        ],
        source: "manual",
        createdAt: "2026-10-02T11:00:00Z",
      },
    ];

    const budget: Budget = {
      id: BUDGET[slug],
      tenantId,
      institutionId,
      academicYearId,
      currency,
      lines: [
        { accountId: incomeAccId, amount: (annualTuition + annualActivity) * 4 },
        { accountId: expenseAccId, amount: annualActivity * 2 },
      ],
      status: "approved",
      ...timestamps,
    };

    return { ledgerAccounts, journalEntries, budget };
  },
);

export const LEDGER_ACCOUNTS: readonly LedgerAccount[] = built.flatMap((b) => b.ledgerAccounts);
export const JOURNAL_ENTRIES: readonly JournalEntry[] = built.flatMap((b) => b.journalEntries);
export const BUDGETS: readonly Budget[] = built.map((b) => b.budget);
