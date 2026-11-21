import { ApiErrorSchema, QuoteSchema } from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_HEADER } from "../context";
import { resetControlDb } from "../db";
import { STAFF } from "../fixtures";
import { CONTROL_API_BASE } from "../route";
import { controlHandlers } from "./index";

const server = setupServer(...controlHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetControlDb();
});
afterAll(() => server.close());

const send = (staff: string, id: string, body: unknown = {}) =>
  fetch(`http://localhost${CONTROL_API_BASE}/quotes/${id}/send`, {
    method: "POST",
    headers: { [CONTROL_HEADER.staff]: staff, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const code = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;

describe("P02 mock writes", () => {
  it("sends a human-written draft", async () => {
    const res = await send(STAFF.sales, "quo-sr-1");
    expect(QuoteSchema.parse(await res.json()).status).toBe("sent");
  });

  it("refuses an AI draft that nobody checked, then sends it once checked", async () => {
    expect(await code(await send(STAFF.sales, "quo-ax-ai"))).toBe("invalid_request");
    const res = await send(STAFF.sales, "quo-ax-ai", { checkedByHuman: true });
    expect(res.status).toBe(200);
    expect(await code(await send(STAFF.sales, "quo-ax-ai", { checkedByHuman: true }))).toBe(
      "conflict",
    );
  });

  it("keeps partners to their own accounts and billing to reading", async () => {
    expect(await code(await send(STAFF.partnerUser, "quo-sr-1"))).toBe("not_found");
    expect(await code(await send(STAFF.billing, "quo-sr-1"))).toBe("forbidden");
  });
});
