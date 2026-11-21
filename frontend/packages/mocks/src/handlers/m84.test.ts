import { InstallStatusSchema } from "@nexus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
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
});
