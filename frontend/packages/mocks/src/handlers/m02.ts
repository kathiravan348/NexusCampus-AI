import {
  PermissionCodeSchema,
  PermissionSchema,
  PersonSchema,
  RoleAssignmentSchema,
  RoleProfileSchema,
  RoleSchema,
  SessionSchema,
  SsoProviderSchema,
  UserSchema,
  pageSchema,
} from "@nexus/contracts";
import { z } from "zod";
import { familyOf, maskPerson, ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok } from "./route";

const M = "M02";
const USER_READ = "m02.user.read";
/** Session lists of other users (device, IP) are for people who manage users. */
const USER_MANAGE = "m02.user.invite";

export const MeResponseSchema = z.strictObject({
  user: UserSchema,
  person: PersonSchema,
  roleProfiles: z.array(RoleProfileSchema),
  assignments: z.array(RoleAssignmentSchema),
  permissions: z.array(PermissionCodeSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const m02Handlers = [
  get("/me", { module: M }, (ctx) => {
    const { tenantId, userId, personId } = ctx.viewer;
    return ok(MeResponseSchema, {
      user: found(mockDb.users.find((u) => u.id === userId)),
      person: maskPerson(
        found(ofTenant(mockDb.people, tenantId).find((p) => p.id === personId)),
        ctx.viewer,
      ),
      roleProfiles: ofTenant(mockDb.roleProfiles, tenantId).filter((r) => r.personId === personId),
      assignments: ofTenant(mockDb.roleAssignments, tenantId).filter((a) => a.userId === userId),
      permissions: [...ctx.viewer.permissions].sort(),
    });
  }),

  /** Everyone may list people; without `m02.user.read` only themselves and their linked learners. */
  get("/people", { module: M }, (ctx) => {
    const people = ofTenant(mockDb.people, ctx.viewer.tenantId);
    const family = familyOf(ctx.viewer);
    const visible = ctx.viewer.permissions.has(USER_READ)
      ? people
      : people.filter((p) => family.has(p.id));
    return list(
      ctx,
      visible.map((p) => maskPerson(p, ctx.viewer)),
      pageSchema(PersonSchema),
    );
  }),

  get("/users", { module: M, permission: USER_READ }, (ctx) =>
    list(ctx, ofTenant(mockDb.users, ctx.viewer.tenantId), pageSchema(UserSchema)),
  ),

  get("/roles", { module: M, permission: "m02.role.manage" }, (ctx) =>
    list(ctx, ofTenant(mockDb.roles, ctx.viewer.tenantId), pageSchema(RoleSchema)),
  ),

  get("/permissions", { module: M, permission: "m02.role.manage" }, (ctx) =>
    list(ctx, mockDb.permissions, pageSchema(PermissionSchema)),
  ),

  get("/role-assignments", { module: M, permission: "m02.role.manage" }, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.roleAssignments, ctx.viewer.tenantId),
      pageSchema(RoleAssignmentSchema),
    ),
  ),

  get("/sso-providers", { module: M, permission: "m02.sso.manage" }, (ctx) =>
    list(ctx, ofTenant(mockDb.ssoProviders, ctx.viewer.tenantId), pageSchema(SsoProviderSchema)),
  ),

  /** The viewer's own sessions; every session of the tenant with `m02.user.invite`. */
  get("/sessions", { module: M }, (ctx) => {
    const sessions = ofTenant(mockDb.sessions, ctx.viewer.tenantId);
    const visible = ctx.viewer.permissions.has(USER_MANAGE)
      ? sessions
      : sessions.filter((s) => s.userId === ctx.viewer.userId);
    return list(ctx, visible, pageSchema(SessionSchema));
  }),
];
