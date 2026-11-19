import { RoleSchema, SessionSchema, SsoProviderSchema, UserSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, ofTenant } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CAMPUS, INSTITUTION, TENANT, USER, roleId } from "../fixtures";
import { server } from "../node";

const BASE = "http://localhost/api/v1";
type As = { tenant: string; user: string };
const LS_ADMIN: As = { tenant: TENANT.littleSteps, user: USER.lsPriya };
const LS_TEACHER: As = { tenant: TENANT.littleSteps, user: USER.lsArjun };

function call(method: string, path: string, body?: unknown, as: As = LS_ADMIN) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const auditCount = () => ofTenant(mockDb.auditEvents, TENANT.littleSteps).length;
const teacherRole = roleId(TENANT.littleSteps, "teacher");
const campusScope = { kind: "campus", targetId: CAMPUS.littleSteps };

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("m02 write handlers", () => {
  it("invites a user as invited, with a role assignment and an audit event", async () => {
    const before = auditCount();
    const res = await call("POST", "/users/invite", {
      legalName: "Neha Kapoor",
      email: "Neha.Kapoor@littlesteps.example.in",
      roleId: teacherRole,
      scope: campusScope,
    });
    expect(res.status).toBe(201);
    const user = UserSchema.parse(await res.json());
    expect(user.status).toBe("invited");
    expect(user.email).toBe("neha.kapoor@littlesteps.example.in");
    expect(mockDb.roleAssignments.some((a) => a.userId === user.id)).toBe(true);
    expect(auditCount()).toBe(before + 1);
  });

  it("rejects a duplicate email (409) and a scope the role does not allow (400)", async () => {
    const existing = mockDb.users.find((u) => u.id === USER.lsArjun)!.email;
    const dup = await call("POST", "/users/invite", {
      legalName: "Someone",
      email: existing.toUpperCase(),
      roleId: teacherRole,
      scope: campusScope,
    });
    expect(dup.status).toBe(409);
    const badScope = await call("POST", "/role-assignments", {
      userId: USER.lsArjun,
      roleId: roleId(TENANT.littleSteps, "guardian"),
      scope: campusScope,
      effectiveFrom: "2026-09-01",
      effectiveTo: null,
    });
    expect(badScope.status).toBe(400);
  });

  it("creates and edits a custom role; system roles are read-only (409)", async () => {
    const res = await call("POST", "/roles", {
      name: "Front desk",
      permissions: ["m01.institution.read"],
      allowedScopeKinds: ["campus"],
    });
    expect(res.status).toBe(201);
    const role = RoleSchema.parse(await res.json());
    const edit = await call("PUT", `/roles/${role.id}`, {
      name: "Front desk",
      permissions: ["m01.institution.read", "m02.user.read"],
      allowedScopeKinds: ["campus"],
    });
    expect(RoleSchema.parse(await edit.json()).permissions).toContain("m02.user.read");
    const system = await call("PUT", `/roles/${teacherRole}`, {
      name: "Teacher",
      permissions: ["m01.institution.read"],
      allowedScopeKinds: ["campus"],
    });
    expect(system.status).toBe(409);
  });

  it("assigns a role and blocks removing your own last admin role", async () => {
    const res = await call("POST", "/role-assignments", {
      userId: USER.lsSunita,
      roleId: teacherRole,
      scope: { kind: "institution", targetId: INSTITUTION.littleSteps },
      effectiveFrom: "2026-09-01",
      effectiveTo: null,
    });
    expect(res.status).toBe(201);
    // Priya has owner + admin: removing one is fine, removing the last one is not.
    expect((await call("DELETE", "/role-assignments/ra-ls-priya-owner")).status).toBe(204);
    expect((await call("DELETE", "/role-assignments/ra-ls-priya-admin")).status).toBe(409);
  });

  it("suspends and reactivates others but never yourself", async () => {
    const suspend = await call("PUT", `/users/${USER.lsArjun}/status`, { status: "suspended" });
    expect(UserSchema.parse(await suspend.json()).status).toBe("suspended");
    const self = await call("PUT", `/users/${USER.lsPriya}/status`, { status: "suspended" });
    expect(self.status).toBe(409);
  });

  it("revokes a session; a teacher cannot manage users (403)", async () => {
    const res = await call("DELETE", "/sessions/ses-ls-priya-1");
    expect(SessionSchema.parse(await res.json()).revokedAt).not.toBeNull();
    const forbidden = await call(
      "PUT",
      `/users/${USER.lsSunita}/status`,
      { status: "suspended" },
      LS_TEACHER,
    );
    expect(forbidden.status).toBe(403);
  });

  it("saves an SSO provider over https and rejects http:// issuers", async () => {
    const body = {
      institutionId: null,
      protocol: "oidc",
      name: "Little Steps Google",
      issuerUrl: "https://accounts.example.com",
      clientId: "ls-client",
      domains: ["littlesteps.example.in"],
      scimEnabled: false,
      enabled: true,
    };
    const res = await call("POST", "/sso-providers", body);
    expect(res.status).toBe(201);
    expect(SsoProviderSchema.parse(await res.json()).name).toBe("Little Steps Google");
    const bad = await call("POST", "/sso-providers", { ...body, issuerUrl: "http://x.example" });
    expect(bad.status).toBe(400);
  });
});
