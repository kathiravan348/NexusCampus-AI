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

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
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
