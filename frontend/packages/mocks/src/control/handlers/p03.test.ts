import { ApiErrorSchema } from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_HEADER } from "../context";
import { controlDb, resetControlDb } from "../db";
import { ACCOUNT, STAFF } from "../fixtures";
import { CONTROL_API_BASE } from "../route";
import { controlHandlers } from "./index";

const server = setupServer(...controlHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetControlDb();
});
afterAll(() => server.close());

const record = (staff: string, id: string, body: unknown) =>
  fetch(`http://localhost${CONTROL_API_BASE}/invoices/${id}/record-transfer`, {
    method: "POST",
    headers: { [CONTROL_HEADER.staff]: staff, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const code = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;

describe("P03 mock writes", () => {
  it("pays an overdue invoice, adds a manual payment and clears dunning", async () => {
    const res = await record(STAFF.billing, "inv-ls-09", { reference: "HDFC-0915" });
    expect(res.status).toBe(200);
    expect(controlDb.invoices.find((i) => i.id === "inv-ls-09")?.status).toBe("paid");
    expect(controlDb.payments.at(-1)?.gateway).toBe("manual");
    expect(controlDb.dunning.find((d) => d.accountId === ACCOUNT.littleSteps)?.stage).toBe("none");
    expect(controlDb.subscriptions.find((s) => s.accountId === ACCOUNT.littleSteps)?.status).toBe(
      "active",
    );
  });

  it("refuses paid invoices, short references and non-billing staff", async () => {
    expect(await code(await record(STAFF.billing, "inv-ax-26", { reference: "X-123" }))).toBe(
      "conflict",
    );
    expect(await code(await record(STAFF.billing, "inv-ls-09", { reference: "x" }))).toBe(
      "invalid_request",
    );
    expect(await code(await record(STAFF.sales, "inv-ls-09", { reference: "X-123" }))).toBe(
      "forbidden",
    );
  });
});
