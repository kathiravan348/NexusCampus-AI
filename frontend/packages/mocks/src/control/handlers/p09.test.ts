import { ApiErrorSchema, TicketReplySchema } from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_HEADER } from "../context";
import { controlDb, resetControlDb } from "../db";
import { STAFF, TICKET } from "../fixtures";
import { CONTROL_API_BASE } from "../route";
import { controlHandlers } from "./index";

const server = setupServer(...controlHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetControlDb();
});
afterAll(() => server.close());

const reply = (staff: string, id: string, body: unknown) =>
  fetch(`http://localhost${CONTROL_API_BASE}/tickets/${id}/replies`, {
    method: "POST",
    headers: { [CONTROL_HEADER.staff]: staff, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const code = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;
const ticket = (id: string) => controlDb.tickets.find((t) => t.id === id);

describe("P09 mock writes", () => {
  it("assigns a new ticket to the replier and waits for the customer after a public reply", async () => {
    const res = await reply(STAFF.morgan, TICKET.harmonyBilling, {
      body: "The trial ends on 19 Sep; nothing is deleted.",
      internal: false,
    });
    expect(TicketReplySchema.parse(await res.json()).authorStaffId).toBe(STAFF.morgan);
    expect(ticket(TICKET.harmonyBilling)?.assigneeStaffId).toBe(STAFF.morgan);
    expect(ticket(TICKET.harmonyBilling)?.status).toBe("waiting_customer");
  });

  it("opens a new ticket on an internal note without telling the customer", async () => {
    await reply(STAFF.morgan, TICKET.harmonyBilling, { body: "Billing question.", internal: true });
    expect(ticket(TICKET.harmonyBilling)?.status).toBe("open");
  });

  it("refuses closed tickets, empty bodies and partners", async () => {
    expect(
      await code(
        await reply(STAFF.morgan, TICKET.littleStepsCalendar, { body: "x", internal: false }),
      ),
    ).toBe("conflict");
    expect(
      await code(await reply(STAFF.morgan, TICKET.apexTemplates, { body: " ", internal: false })),
    ).toBe("invalid_request");
    expect(
      await code(
        await reply(STAFF.partnerUser, TICKET.apexTemplates, { body: "x", internal: false }),
      ),
    ).toBe("forbidden");
  });
});
