import {
  BudgetSchema,
  JournalEntrySchema,
  LedgerAccountSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M19 read handlers", () => {
  it("lists tenant-local records for admins", async () => {
    const endpoints = [
      ["/ledger-accounts", pageSchema(LedgerAccountSchema)],
      ["/journal-entries", pageSchema(JournalEntrySchema)],
      ["/budgets", pageSchema(BudgetSchema)],
    ] as const;
    for (const [path, schema] of endpoints) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const { items } = schema.parse(await response.json());
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    }
  });

  it("denies accounting records to teachers and guardians", async () => {
    for (const user of [USER.lsArjun, USER.lsSunita]) {
      for (const path of ["/ledger-accounts", "/journal-entries", "/budgets"]) {
        expect((await get(path, user)).status).toBe(403);
      }
    }
  });

  it("denies an account without the read permission or family access", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/ledger-accounts")).status).toBe(403);
  });
});

function getInput() {
  const first = mockDb.ledgerAccounts.find((a) => a.active && a.tenantId === TENANT.littleSteps)!;
  const second = mockDb.ledgerAccounts.find((a) =>
    a.active && a.tenantId === first.tenantId && a.institutionId === first.institutionId &&
    a.id !== first.id,
  )!;
  return {
    institutionId: first.institutionId, postedOn: "2026-11-24", reference: "Weekly review",
    currency: "USD",
    lines: [
      { accountId: first.id, debit: 100, credit: 0 },
      { accountId: second.id, debit: 0, credit: 100 },
    ],
  };
}

function post(body: unknown, user: string = USER.lsPriya) {
  return fetch("http://localhost/api/v1/journal-entries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: TENANT.littleSteps,
      [MOCK_HEADER.user]: user,
    },
    body: JSON.stringify(body),
  });
}

describe("Journal creation", () => {
  it("adds the selected institution's manual entry to the journal", async () => {
    const input = getInput();
    const resp = await post(input);
    expect(resp.status).toBe(201);
    const entry = JournalEntrySchema.parse(await resp.json());
    expect(entry).toMatchObject({ ...input, tenantId: TENANT.littleSteps, source: "manual" });
    expect(mockDb.journalEntries[0]).toEqual(entry);
  });

  it("shows a scoped error for invalid accounts or institutions", async () => {
    const base = getInput();
    const other = mockDb.ledgerAccounts.find((a) => a.tenantId !== TENANT.littleSteps)!;
    mockDb.ledgerAccounts = mockDb.ledgerAccounts.map((account) =>
      account.id === base.lines[0]?.accountId ? { ...account, active: false } : account,
    );
    const count = mockDb.journalEntries.length;
    for (const [input, resultPath] of [
      [base, "lines"],
      [{ ...base, lines: base.lines.map((row) => ({ ...row, accountId: other.id })) }, "lines"],
      [{ ...base, institutionId: other.institutionId }, "institutionId"],
      [{ ...base, lines: [] }, "lines"],
    ] as const) {
      const response = await post(input);
      expect(response.status).toBe(400);
      const { error } = await response.json();
      expect(error).toMatchObject({ code: "invalid_request", details: [{ path: resultPath }] });
      expect(JSON.stringify(error)).not.toContain(base.reference);
    }
    expect(mockDb.journalEntries.length).toBe(count);
  });

  it("denies a user who cannot manage the ledger", async () => {
    expect((await post(getInput(), USER.lsArjun)).status).toBe(403);
  });
});
