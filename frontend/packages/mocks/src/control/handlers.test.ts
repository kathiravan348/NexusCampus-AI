import { ApiErrorSchema, StaffSessionSchema } from "@nexus/contracts";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { CONTROL_HEADER } from "./context";
import { resetControlDb } from "./db";
import { ACCOUNT, STAFF } from "./fixtures";
import { controlHandlers } from "./handlers";
import { CONTROL_API_BASE } from "./route";

const server = setupServer(...controlHandlers);
const BASE = `http://localhost${CONTROL_API_BASE}`;

function call(path: string, staff: string | null = STAFF.admin, scenario?: string) {
  const headers: Record<string, string> = {};
  if (staff) headers[CONTROL_HEADER.staff] = staff;
  if (scenario) headers[MOCK_HEADER.scenario] = scenario;
  return fetch(`${BASE}${path}`, { headers });
}

async function code(res: Response) {
  return ApiErrorSchema.parse(await res.json()).error.code;
}

async function page(res: Response) {
  expect(res.status).toBe(200);
  return (await res.json()) as { items: { id?: string; accountId?: string }[]; total: number };
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetControlDb();
});
afterAll(() => server.close());

const LISTS = [
  "accounts",
  "contacts",
  "opportunities",
  "notes",
  "contracts",
  "catalogue",
  "quotes",
  "subscriptions",
  "invoices",
  "payments",
  "credit-notes",
  "dunning",
  "usage",
  "partners",
  "deals",
  "commissions",
  "provisioning-jobs",
  "offboarding-jobs",
  "shred-certificates",
  "licences",
  "deployments",
  "health-signals",
  "releases",
  "rollouts",
  "extensions",
  "extension-compatibility",
  "sandboxes",
  "portability-jobs",
  "tickets",
  "ticket-replies",
  "sla-policies",
  "kb-articles",
  "broker-requests",
  "broker-sessions",
  "break-glass-cases",
  "staff",
  "sub-processors",
  "certifications",
  "incidents",
  "dpas",
  "projects",
  "metrics",
  "account-health",
];

describe("mock Control API", () => {
  it.each(LISTS)("GET /%s answers a non-empty page for the super admin", async (path) => {
    const body = await page(await call(`/${path}`));
    expect(body.total).toBeGreaterThan(0);
  });

  it("returns the staff session with MFA and permissions", async () => {
    const res = await call("/me", STAFF.morgan);
    const session = StaffSessionSchema.parse(await res.json());
    expect(session.staff.id).toBe(STAFF.morgan);
    expect(session.permissions).toContain("ctl.ticket.reply");
    expect(session.permissions).not.toContain("ctl.billing.read");
  });

  it("answers 401 without staff and for an unknown staff id", async () => {
    expect(await code(await call("/accounts", null))).toBe("unauthorized");
    expect(await code(await call("/me", "stf-9999"))).toBe("unauthorized");
  });

  it("answers 403 when the role lacks the permission", async () => {
    const res = await call("/invoices", STAFF.morgan);
    expect(res.status).toBe(403);
    expect(await code(res)).toBe("forbidden");
    expect((await call("/staff", STAFF.sales)).status).toBe(403);
  });

  it("shows a partner user only the accounts its partner manages", async () => {
    const accounts = await page(await call("/accounts", STAFF.partnerUser));
    expect(accounts.items.map((a) => a.id).sort()).toEqual([ACCOUNT.apex, ACCOUNT.lotus]);
    const quotes = await page(await call("/quotes", STAFF.partnerUser));
    expect(
      quotes.items.every((q) => q.accountId === ACCOUNT.lotus || q.accountId === ACCOUNT.apex),
    ).toBe(true);
    expect((await call(`/accounts/${ACCOUNT.riverside}`, STAFF.partnerUser)).status).toBe(404);
    expect((await call(`/accounts/${ACCOUNT.apex}`, STAFF.partnerUser)).status).toBe(200);
  });

  it("filters, pages and finds by id", async () => {
    const selfHosted = await page(await call("/accounts?deliveryModel=self_hosted"));
    expect(selfHosted.items.map((a) => a.id).sort()).toEqual([ACCOUNT.alpine, ACCOUNT.coastal]);
    const first = await page(await call("/accounts?page=1&pageSize=3"));
    expect(first.items).toHaveLength(3);
    expect(first.total).toBe(10);
    expect(await code(await call("/accounts?pageSize=0"))).toBe("invalid_request");
    expect((await call(`/dunning/${ACCOUNT.littleSteps}`)).status).toBe(200);
    expect((await call("/metrics/2026-08")).status).toBe(200);
    expect(await code(await call("/accounts/acc-nope"))).toBe("not_found");
  });

  it("honours the empty and error scenarios", async () => {
    expect((await page(await call("/tickets", STAFF.admin, "empty"))).total).toBe(0);
    expect((await call("/tickets", STAFF.admin, "error")).status).toBe(500);
  });
});
