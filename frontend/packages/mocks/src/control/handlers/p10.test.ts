import {
  ApiErrorSchema,
  BrokerRequestSchema,
  pageSchema,
  type AccessRequest,
} from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mockDb, resetMockDb } from "../../db";
import { TENANT } from "../../fixtures";
import { CONTROL_HEADER } from "../context";
import { resetControlDb } from "../db";
import { ACCOUNT, STAFF } from "../fixtures";
import { CONTROL_API_BASE } from "../route";
import { controlHandlers } from "./index";

const server = setupServer(...controlHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetControlDb();
  resetMockDb();
});
afterAll(() => server.close());

const BASE = `http://localhost${CONTROL_API_BASE}`;
const request = {
  accountId: ACCOUNT.harmony,
  tenantId: TENANT.harmony,
  ticketId: null,
  reason: "Check the calendar import.",
  modules: ["M01"],
  mode: "read",
  durationHours: 4,
};
const post = (staff: string, body: unknown) =>
  fetch(`${BASE}/broker-requests`, {
    method: "POST",
    headers: { [CONTROL_HEADER.staff]: staff, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const code = async (res: Response) => ApiErrorSchema.parse(await res.json()).error.code;

describe("P10 broker writes and the M83 loop", () => {
  it("creates the request on both sides and shows the institution's decision here", async () => {
    const raw = await (await post(STAFF.morgan, request)).json();
    const created = BrokerRequestSchema.parse(raw);
    const m83 = (mockDb.accessRequests as AccessRequest[]).find((r) => r.id === created.id);
    expect(m83?.status).toBe("pending");
    expect(m83?.tenantId).toBe(TENANT.harmony);

    // The institution's admin approves in their own app (M83), a minute later.
    const decided = new Date(Date.parse(created.requestedAt) + 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");
    Object.assign(m83 ?? {}, {
      status: "approved",
      decidedAt: decided,
      decidedBy: "usr-hm-admin",
    });
    const res = await fetch(`${BASE}/broker-requests/${created.id}`, {
      headers: { [CONTROL_HEADER.staff]: STAFF.morgan },
    });
    expect(BrokerRequestSchema.parse(await res.json()).status).toBe("approved");
    const list = pageSchema(BrokerRequestSchema).parse(
      await (
        await fetch(`${BASE}/broker-requests?pageSize=200`, {
          headers: { [CONTROL_HEADER.staff]: STAFF.morgan },
        })
      ).json(),
    );
    expect(list.items.find((r) => r.id === created.id)?.decidedAt).toBe(decided);
  });

  it("refuses the vault in scope, 73 hours, a tenant of another account and staff without the right", async () => {
    expect(await code(await post(STAFF.morgan, { ...request, modules: ["M83"] }))).toBe(
      "invalid_request",
    );
    expect(await code(await post(STAFF.morgan, { ...request, durationHours: 73 }))).toBe(
      "invalid_request",
    );
    expect(await code(await post(STAFF.morgan, { ...request, tenantId: TENANT.apex }))).toBe(
      "not_found",
    );
    expect(await code(await post(STAFF.release, request))).toBe("forbidden");
  });
});
