import { DataSubjectRequestSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, ofTenant } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { server } from "../node";

const BASE = "http://localhost/api/v1";
type As = { tenant: string; user: string };
const AX_ADMIN: As = { tenant: TENANT.apex, user: USER.axKhalid };
const AX_TEACHER: As = { tenant: TENANT.apex, user: USER.axFatima };

function patch(id: string, body: unknown, as: As = AX_ADMIN) {
  return fetch(`${BASE}/data-requests/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    body: JSON.stringify(body),
  });
}

const chain = () => ofTenant(mockDb.auditEvents, TENANT.apex);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("PATCH /data-requests/:id", () => {
  it("moves received → in_progress → completed and appends linked audit events", async () => {
    const before = chain().length;
    const started = await patch("dsr-ax-correct", { status: "in_progress" });
    expect(DataSubjectRequestSchema.parse(await started.json()).status).toBe("in_progress");
    const done = await patch("dsr-ax-correct", { status: "completed" });
    const dsr = DataSubjectRequestSchema.parse(await done.json());
    expect(dsr.status).toBe("completed");
    expect(dsr.completedAt).not.toBeNull();
    const events = chain();
    expect(events).toHaveLength(before + 2);
    expect(events.at(-1)!.action).toBe("m06.dataRequest.completed");
    expect(events.at(-1)!.prevHash).toBe(events.at(-2)!.hash);
  });

  it("rejects skipping a step (409) and a rejection without a reason (400)", async () => {
    expect((await patch("dsr-ax-correct", { status: "completed" })).status).toBe(409);
    await patch("dsr-ax-correct", { status: "in_progress" });
    expect((await patch("dsr-ax-correct", { status: "rejected" })).status).toBe(400);
    const ok = await patch("dsr-ax-correct", {
      status: "rejected",
      reason: "Not the data subject",
    });
    expect(ok.status).toBe(200);
    expect(
      chain()
        .at(-1)!
        .changes.map((c) => c.field),
    ).toEqual(["status", "rejectionReason"]);
  });

  it("needs m06.request.manage (403)", async () => {
    expect((await patch("dsr-ax-correct", { status: "in_progress" }, AX_TEACHER)).status).toBe(403);
  });
});
