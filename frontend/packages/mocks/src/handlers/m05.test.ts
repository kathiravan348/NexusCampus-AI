import { EntitlementSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, ofTenant } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { server } from "../node";

const BASE = "http://localhost/api/v1";
type As = { tenant: string; user: string };
const NB_ADMIN: As = { tenant: TENANT.northbridge, user: USER.nbRobert };
const NB_TEACHER: As = { tenant: TENANT.northbridge, user: USER.nbElena };
const HM_ADMIN: As = { tenant: TENANT.harmony, user: USER.hmWeiLing };

function patch(moduleId: string, enabled: boolean, as: As = NB_ADMIN) {
  return fetch(`${BASE}/entitlements/${moduleId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    body: JSON.stringify({ enabled }),
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("PATCH /entitlements/:moduleId", () => {
  it("switches an optional plan module off and on, with audit events", async () => {
    const before = ofTenant(mockDb.auditEvents, TENANT.northbridge).length;
    const off = EntitlementSchema.parse(await (await patch("M10", false)).json());
    expect(off.enabled).toBe(false);
    const on = EntitlementSchema.parse(await (await patch("M10", true)).json());
    expect(on.enabled).toBe(true);
    const events = ofTenant(mockDb.auditEvents, TENANT.northbridge);
    expect(events).toHaveLength(before + 2);
    expect(events.at(-2)!.action).toBe("m05.module.disabled");
  });

  it("refuses core modules (409), modules outside the plan (403) and non-managers (403)", async () => {
    expect((await patch("M02", false)).status).toBe(409);
    const notInPlan = await patch("M11", true, HM_ADMIN);
    expect(notInPlan.status).toBe(403);
    expect(((await notInPlan.json()) as { error: { code: string } }).error.code).toBe(
      "module_disabled",
    );
    expect((await patch("M10", false, NB_TEACHER)).status).toBe(403);
  });
});
