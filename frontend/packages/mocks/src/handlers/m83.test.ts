import { AccessGrantSchema, AccessRequestSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, ofTenant } from "../context";
import { mockDb, resetMockDb } from "../db";
import { ACCESS_REQUEST, TENANT, USER } from "../fixtures";
import { server } from "../node";
import { ApproveResponseSchema } from "./m83";

const BASE = "http://localhost/api/v1";
type As = { tenant: string; user: string };
const RV_OWNER: As = { tenant: TENANT.riverside, user: USER.rvHelen };
const RV_TEACHER: As = { tenant: TENANT.riverside, user: USER.rvTom };
const PENDING = ACCESS_REQUEST.riversidePending;

function post(path: string, body: unknown, as: As = RV_OWNER) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    body: JSON.stringify(body),
  });
}
const approve = (body: unknown, as?: As) => post(`/access-requests/${PENDING}/approve`, body, as);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("m83 write handlers", () => {
  it("approves with a narrowed scope and creates a grant of at most 72 h", async () => {
    const audits = ofTenant(mockDb.auditEvents, TENANT.riverside).length;
    const res = await approve({ modules: ["M03"], mode: "read", durationHours: 8 });
    const { request, grant } = ApproveResponseSchema.parse(await res.json());
    expect(request.status).toBe("approved");
    expect(request.decidedBy).toBe(USER.rvHelen);
    expect(Date.parse(grant.endsAt) - Date.parse(grant.startsAt)).toBe(8 * 3_600_000);
    expect(ofTenant(mockDb.auditEvents, TENANT.riverside)).toHaveLength(audits + 1);
    expect((await approve({ modules: ["M03"], mode: "read", durationHours: 8 })).status).toBe(409);
  });

  it("rejects any widening: extra modules, edit mode or longer time (400)", async () => {
    for (const body of [
      { modules: ["M03", "M02"], mode: "read", durationHours: 8 },
      { modules: ["M03"], mode: "edit", durationHours: 8 },
      { modules: ["M03"], mode: "read", durationHours: 48 },
    ]) {
      expect((await approve(body)).status).toBe(400);
    }
  });

  it("denies only with a reason", async () => {
    expect((await post(`/access-requests/${PENDING}/deny`, { reason: " " })).status).toBe(400);
    const res = await post(`/access-requests/${PENDING}/deny`, { reason: "Not needed" });
    expect(AccessRequestSchema.parse(await res.json()).status).toBe("denied");
  });

  it("revokes an active grant early and marks the request revoked", async () => {
    const { grant } = ApproveResponseSchema.parse(
      await (await approve({ modules: ["M03"], mode: "read", durationHours: 24 })).json(),
    );
    const res = await post(`/access-grants/${grant.id}/revoke`, {});
    expect(AccessGrantSchema.parse(await res.json()).revokedAt).not.toBeNull();
    expect(mockDb.accessRequests.find((r) => r.id === PENDING)!.status).toBe("revoked");
    expect((await post(`/access-grants/${grant.id}/revoke`, {})).status).toBe(409);
  });

  it("needs m83.grant.approve (403)", async () => {
    const res = await approve({ modules: ["M03"], mode: "read", durationHours: 8 }, RV_TEACHER);
    expect(res.status).toBe(403);
  });
});
