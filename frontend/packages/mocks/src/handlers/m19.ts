import {
  BudgetSchema,
  JournalEntryInputSchema,
  JournalEntrySchema,
  LedgerAccountSchema,
  pageSchema,
} from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, get, list } from "./route";

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
  http.post(`*${API_BASE}/journal-entries`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const { tenantId, permissions } = readViewer(request);
      if (!entitled(tenantId, "M19")) throw new ApiFailure("module_disabled");
      if (!permissions.has("m19.accounts.manage")) throw new ApiFailure("forbidden");

      const parsed = JournalEntryInputSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        const paths = new Set(parsed.error.issues.map(({ path }) => path[0]));
        const details = Object.keys(JournalEntryInputSchema.shape)
          .filter((key) => paths.has(key))
          .map((key) => ({ path: key, message: "Invalid journal entry field" }));
        throw new ApiFailure("invalid_request", details.length ? details : undefined);
      }
      const { institutionId, lines } = parsed.data;
      if (!ofTenant(mockDb.institutions, tenantId).some((institution) => institution.id === institutionId)) {
        throw new ApiFailure("invalid_request", [
          { path: "institutionId", message: "Invalid institution" },
        ]);
      }
      const activeAccounts = new Set(
        ofTenant(mockDb.ledgerAccounts, tenantId)
          .filter((account) => account.active && account.institutionId === institutionId)
          .map((account) => account.id),
      );
      if (lines.some((line) => !activeAccounts.has(line.accountId))) {
        throw new ApiFailure("invalid_request", [
          { path: "lines", message: "Choose active accounts for the selected institution" },
        ]);
      }
      const entry = JournalEntrySchema.parse({
        ...parsed.data,
        id: `je-${globalThis.crypto.randomUUID()}`,
        tenantId,
        source: "manual",
        createdAt: new Date().toISOString(),
      });
      mockDb.journalEntries.unshift(entry);
      return HttpResponse.json(entry, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
  get("/budgets", M, (ctx) =>
    list(ctx, ofTenant(mockDb.budgets, ctx.viewer.tenantId), pageSchema(BudgetSchema)),
  ),
];
