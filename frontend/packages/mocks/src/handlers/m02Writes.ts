import {
  PersonSchema,
  RoleAssignmentSchema,
  RoleSchema,
  SessionSchema,
  SsoProviderSchema,
  UserSchema,
  type Person,
  type Role,
  type RoleAssignment,
  type SsoProvider,
  type User,
} from "@nexus/contracts";
import { ApiFailure, ofTenant } from "../context";
import { mockDb } from "../db";
import {
  ADMIN_PERMISSION,
  AssignmentInputSchema,
  InviteUserInputSchema,
  RoleInputSchema,
  SsoProviderInputSchema,
  UserStatusInputSchema,
  appendAudit,
  assertScope,
  created,
  keepsAdmin,
  newId,
  readBody,
  writeRoute,
} from "./m02Store";
import { found, ok } from "./route";

const USER_MANAGE = "m02.user.invite";
const ROLE_MANAGE = ADMIN_PERMISSION;
const SSO_MANAGE = "m02.sso.manage";

/** M02 writes (NEX-016): invite, status, custom roles, assignments, session revoke, SSO settings. */
export const m02WriteHandlers = [
  /** Invite: a new person + `invited` user + first role assignment. Duplicate email → 409. */
  writeRoute("post", "/users/invite", USER_MANAGE, async (ctx) => {
    const { tenantId } = ctx.viewer;
    const input = await readBody(ctx.request, InviteUserInputSchema);
    const email = input.email.trim().toLowerCase();
    if (ofTenant(mockDb.users, tenantId).some((u) => u.email.toLowerCase() === email)) {
      throw new ApiFailure("conflict", [
        { path: "email", message: "This email already has an account" },
      ]);
    }
    const role = found(ofTenant(mockDb.roles, tenantId).find((r) => r.id === input.roleId));
    assertScope(tenantId, role.allowedScopeKinds, input.scope);
    const now = new Date().toISOString();
    const person = PersonSchema.parse({
      id: newId("per"),
      tenantId,
      legalName: input.legalName,
      preferredName: null,
      dateOfBirth: null,
      isMinor: false,
      email,
      phone: null,
      preferredLocale: null,
      retentionState: "active",
      createdAt: now,
      updatedAt: now,
    });
    const user = UserSchema.parse({
      id: newId("usr"),
      tenantId,
      personId: person.id,
      email,
      status: "invited",
      mfaEnabled: false,
      passkeyCount: 0,
      ssoOnly: false,
      lastSignInAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const assignment = RoleAssignmentSchema.parse({
      id: newId("ra"),
      tenantId,
      userId: user.id,
      roleId: role.id,
      scope: input.scope,
      academicYearId: null,
      effectiveFrom: now.slice(0, 10),
      effectiveTo: null,
      grantedBy: ctx.viewer.userId,
      createdAt: now,
    });
    (mockDb.people as Person[]).push(person);
    (mockDb.users as User[]).push(user);
    (mockDb.roleAssignments as RoleAssignment[]).push(assignment);
    await appendAudit(ctx.viewer, "m02.user.invited", "user", user.id, [
      "email",
      "roleId",
      "scope",
    ]);
    return created(user);
  }),

  /** Suspend or reactivate; nobody can suspend themselves (409). */
  writeRoute("put", "/users/:id/status", USER_MANAGE, async (ctx) => {
    const user = found(
      ofTenant(mockDb.users, ctx.viewer.tenantId).find((u) => u.id === ctx.params["id"]),
    );
    const { status } = await readBody(ctx.request, UserStatusInputSchema);
    if (user.id === ctx.viewer.userId) {
      throw new ApiFailure("conflict", [
        { path: "status", message: "You cannot change your own status" },
      ]);
    }
    user.status = status;
    user.updatedAt = new Date().toISOString();
    await appendAudit(
      ctx.viewer,
      `m02.user.${status === "active" ? "reactivated" : "suspended"}`,
      "user",
      user.id,
      ["status"],
    );
    return ok(UserSchema, user);
  }),

  writeRoute("post", "/roles", ROLE_MANAGE, async (ctx) => {
    const input = await readBody(ctx.request, RoleInputSchema);
    const now = new Date().toISOString();
    const role = RoleSchema.parse({
      ...input,
      id: newId("rol"),
      tenantId: ctx.viewer.tenantId,
      system: false,
      createdAt: now,
      updatedAt: now,
    });
    (mockDb.roles as Role[]).push(role);
    await appendAudit(ctx.viewer, "m02.role.created", "role", role.id, ["name", "permissions"]);
    return created(role);
  }),

  /** System roles ship with the product: 409 on edit. */
  writeRoute("put", "/roles/:id", ROLE_MANAGE, async (ctx) => {
    const roles = mockDb.roles as Role[];
    const existing = found(
      ofTenant(roles, ctx.viewer.tenantId).find((r) => r.id === ctx.params["id"]),
    );
    if (existing.system)
      throw new ApiFailure("conflict", [{ path: "", message: "System roles are read-only" }]);
    const input = await readBody(ctx.request, RoleInputSchema);
    const role = RoleSchema.parse({ ...existing, ...input, updatedAt: new Date().toISOString() });
    roles[roles.indexOf(existing)] = role;
    await appendAudit(ctx.viewer, "m02.role.updated", "role", role.id, [
      "name",
      "permissions",
      "allowedScopeKinds",
    ]);
    return ok(RoleSchema, role);
  }),

  writeRoute("post", "/role-assignments", ROLE_MANAGE, async (ctx) => {
    const { tenantId } = ctx.viewer;
    const input = await readBody(ctx.request, AssignmentInputSchema);
    found(ofTenant(mockDb.users, tenantId).find((u) => u.id === input.userId));
    const role = found(ofTenant(mockDb.roles, tenantId).find((r) => r.id === input.roleId));
    assertScope(tenantId, role.allowedScopeKinds, input.scope);
    const assignment = RoleAssignmentSchema.parse({
      ...input,
      id: newId("ra"),
      tenantId,
      academicYearId: null,
      grantedBy: ctx.viewer.userId,
      createdAt: new Date().toISOString(),
    });
    (mockDb.roleAssignments as RoleAssignment[]).push(assignment);
    await appendAudit(ctx.viewer, "m02.role.assigned", "roleAssignment", assignment.id, [
      "roleId",
      "scope",
    ]);
    return created(assignment);
  }),

  /** Removing your own last admin-capable assignment → 409. */
  writeRoute("delete", "/role-assignments/:id", ROLE_MANAGE, async (ctx) => {
    const { tenantId, userId } = ctx.viewer;
    const assignments = mockDb.roleAssignments as RoleAssignment[];
    const existing = found(ofTenant(assignments, tenantId).find((a) => a.id === ctx.params["id"]));
    const role = mockDb.roles.find((r) => r.id === existing.roleId);
    const isAdmin = role?.permissions.includes(ADMIN_PERMISSION) ?? false;
    if (existing.userId === userId && isAdmin && !keepsAdmin(tenantId, userId, existing.id)) {
      throw new ApiFailure("conflict", [
        { path: "", message: "You cannot remove your own last admin role" },
      ]);
    }
    assignments.splice(assignments.indexOf(existing), 1);
    await appendAudit(ctx.viewer, "m02.role.unassigned", "roleAssignment", existing.id, ["roleId"]);
    return new Response(null, { status: 204 });
  }),

  /** Revoke: own sessions for everyone, any session of the tenant with `m02.user.invite`. */
  writeRoute("delete", "/sessions/:id", null, async (ctx) => {
    const session = found(
      ofTenant(mockDb.sessions, ctx.viewer.tenantId).find((s) => s.id === ctx.params["id"]),
    );
    if (session.userId !== ctx.viewer.userId && !ctx.viewer.permissions.has(USER_MANAGE)) {
      throw new ApiFailure("forbidden");
    }
    session.revokedAt = session.revokedAt ?? new Date().toISOString();
    await appendAudit(ctx.viewer, "m02.session.revoked", "session", session.id, ["revokedAt"]);
    return ok(SessionSchema, session);
  }),

  writeRoute("post", "/sso-providers", SSO_MANAGE, async (ctx) => {
    const input = await readBody(ctx.request, SsoProviderInputSchema);
    const now = new Date().toISOString();
    const provider = SsoProviderSchema.parse({
      ...input,
      id: newId("sso"),
      tenantId: ctx.viewer.tenantId,
      createdAt: now,
      updatedAt: now,
    });
    (mockDb.ssoProviders as SsoProvider[]).push(provider);
    await appendAudit(
      ctx.viewer,
      "m02.sso.created",
      "ssoProvider",
      provider.id,
      Object.keys(input),
    );
    return created(provider);
  }),

  writeRoute("put", "/sso-providers/:id", SSO_MANAGE, async (ctx) => {
    const providers = mockDb.ssoProviders as SsoProvider[];
    const existing = found(
      ofTenant(providers, ctx.viewer.tenantId).find((p) => p.id === ctx.params["id"]),
    );
    const input = await readBody(ctx.request, SsoProviderInputSchema);
    const provider = SsoProviderSchema.parse({
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    });
    providers[providers.indexOf(existing)] = provider;
    await appendAudit(
      ctx.viewer,
      "m02.sso.updated",
      "ssoProvider",
      provider.id,
      Object.keys(input),
    );
    return ok(SsoProviderSchema, provider);
  }),
];
