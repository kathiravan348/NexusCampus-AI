import {
  DiagnosticBundleSchema,
  DiagnosticContentSchema,
  InstallStatusSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { DEMO_PERSONAS, TENANT } from "../fixtures";
import { server } from "../node";

const BASE = "http://localhost/api/v1";

function as(tenantId: string, role: string) {
  const p = DEMO_PERSONAS.find(
    (x) => x.tenantId === tenantId && x.labelKey === `m02.persona.${role}`,
  );
  if (!p) throw new Error(`no ${role} for ${tenantId}`);
  return { [MOCK_HEADER.tenant]: p.tenantId, [MOCK_HEADER.user]: p.userId };
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
afterEach(() => resetMockDb());

function bundleAudit() {
  return mockDb.auditEvents.filter((event) => event.moduleId === "M84");
}

describe("M84 install handlers", () => {
  it("answers the Apex admin with a valid install status", async () => {
    const res = await fetch(`${BASE}/install/status`, { headers: as(TENANT.apex, "admin") });
    expect(res.status).toBe(200);
    expect(InstallStatusSchema.parse(await res.json()).version).toBe("2.4.1");
  });

  it("refuses a tenant without an install and a user without the permission", async () => {
    const other = await fetch(`${BASE}/install/status`, {
      headers: as(TENANT.littleSteps, "admin"),
    });
    expect(other.status).toBe(403);
    const teacher = await fetch(`${BASE}/install/backups`, { headers: as(TENANT.apex, "teacher") });
    expect(teacher.status).toBe(403);
  });

  it("returns a waiting bundle's text, then approves it once (409 the second time)", async () => {
    const admin = as(TENANT.apex, "admin");
    const content = await fetch(`${BASE}/install/diagnostics/dgn-0914/content`, { headers: admin });
    expect(content.status).toBe(200);
    expect(DiagnosticContentSchema.parse(await content.json()).content).toContain(
      "nexus-diagnostics/1",
    );
    const approve = () =>
      fetch(`${BASE}/install/diagnostics/dgn-0914/approve`, { method: "POST", headers: admin });
    const first = await approve();
    expect(first.status).toBe(200);
    const approved = DiagnosticBundleSchema.parse(await first.json());
    expect(approved.status).toBe("approved");
    const actorId = admin[MOCK_HEADER.user];
    expect(approved.reviewedBy).toBe(actorId);
    expect((await approve()).status).toBe(409);
    const discardAfter = await fetch(`${BASE}/install/diagnostics/dgn-0914/discard`, {
      method: "POST",
      headers: admin,
    });
    expect(discardAfter.status).toBe(409);
    expect(bundleAudit()).toEqual([
      expect.objectContaining({
        tenantId: TENANT.apex,
        action: "m84.diagnosticBundle.approved",
        actorKind: "user",
        actorId,
        targetType: "diagnosticBundle",
        targetId: approved.id,
        changes: [{ field: "status", sensitive: false }],
      }),
    ]);
  });

  it("discards a waiting bundle; refuses unknown ids and users without the permission", async () => {
    const admin = as(TENANT.apex, "admin");
    const discard = await fetch(`${BASE}/install/diagnostics/dgn-0914/discard`, {
      method: "POST",
      headers: admin,
    });
    expect(DiagnosticBundleSchema.parse(await discard.json()).status).toBe("discarded");
    const unknown = await fetch(`${BASE}/install/diagnostics/dgn-nope/content`, { headers: admin });
    expect(unknown.status).toBe(404);
    const teacher = await fetch(`${BASE}/install/diagnostics/dgn-0914/approve`, {
      method: "POST",
      headers: as(TENANT.apex, "teacher"),
    });
    expect(teacher.status).toBe(403);
    expect(bundleAudit()).toEqual([
      expect.objectContaining({
        tenantId: TENANT.apex,
        action: "m84.diagnosticBundle.discarded",
        actorKind: "user",
        actorId: admin[MOCK_HEADER.user],
        targetType: "diagnosticBundle",
        targetId: "dgn-0914",
        changes: [{ field: "status", sensitive: false }],
      }),
    ]);
  });
});
