import {
  EmailSchema,
  IdSchema,
  IsoDateSchema,
  NameSchema,
  PAGE_SIZE_MAX,
  PermissionCodeSchema,
  PermissionSchema,
  PersonSchema,
  RoleAssignmentSchema,
  RoleProfileSchema,
  RoleSchema,
  RoleScopeSchema,
  ScopeKindSchema,
  SessionSchema,
  SsoProtocolSchema,
  SsoProviderSchema,
  UserSchema,
  pageSchema,
  type Role,
  type RoleAssignment,
  type Session,
  type SsoProvider,
  type User,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

/** The signed-in user: account, person (masked per G-6), memberships, roles and resolved permissions. */
export const MeResponseSchema = z.strictObject({
  user: UserSchema,
  person: PersonSchema,
  roleProfiles: z.array(RoleProfileSchema),
  assignments: z.array(RoleAssignmentSchema),
  permissions: z.array(PermissionCodeSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/* Write inputs (M02, L1: online saves). The mock server validates the same shapes. */

export const InviteUserInputSchema = z.strictObject({
  legalName: NameSchema,
  email: EmailSchema,
  roleId: IdSchema,
  scope: RoleScopeSchema,
});
export type InviteUserInput = z.infer<typeof InviteUserInputSchema>;

export const RoleInputSchema = z.strictObject({
  name: NameSchema,
  permissions: z.array(PermissionCodeSchema).min(1),
  allowedScopeKinds: z.array(ScopeKindSchema).min(1),
});
export type RoleInput = z.infer<typeof RoleInputSchema>;

export const AssignmentInputSchema = z.strictObject({
  userId: IdSchema,
  roleId: IdSchema,
  scope: RoleScopeSchema,
  effectiveFrom: IsoDateSchema,
  effectiveTo: IsoDateSchema.nullable(),
});
export type AssignmentInput = z.infer<typeof AssignmentInputSchema>;

/** SSO settings as edited in the browser. Client secrets are never part of it (set in the vault). */
export const SsoProviderInputSchema = z.strictObject({
  institutionId: IdSchema.nullable(),
  protocol: SsoProtocolSchema,
  name: NameSchema,
  issuerUrl: z.url({ protocol: /^https$/, message: "Issuer URL must start with https://" }),
  clientId: z.string().trim().min(1).max(256),
  domains: z
    .array(
      z.string().regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, {
        message: "Must be a lower-case domain, e.g. riverside.example.edu",
      }),
    )
    .min(1),
  scimEnabled: z.boolean(),
  enabled: z.boolean(),
});
export type SsoProviderInput = z.infer<typeof SsoProviderInputSchema>;

const all = { pageSize: PAGE_SIZE_MAX };
const PeoplePage = pageSchema(PersonSchema);
const UserPage = pageSchema(UserSchema);
const RolePage = pageSchema(RoleSchema);
const PermissionPage = pageSchema(PermissionSchema);
const AssignmentPage = pageSchema(RoleAssignmentSchema);
const SessionPage = pageSchema(SessionSchema);
const SsoPage = pageSchema(SsoProviderSchema);
const enc = encodeURIComponent;

export function useMe() {
  return useScopedQuery(queryKeys.m02.me, (client, signal) =>
    client.get("/me", MeResponseSchema, undefined, { signal }),
  );
}

export function usePeople() {
  return useScopedQuery(queryKeys.m02.people, (c, signal) =>
    c.get("/people", PeoplePage, all, { signal }),
  );
}

export function useUsers(enabled = true) {
  return useScopedQuery(
    queryKeys.m02.users,
    (c, signal) => c.get("/users", UserPage, all, { signal }),
    enabled,
  );
}

export function useRoles(enabled = true) {
  return useScopedQuery(
    queryKeys.m02.roles,
    (c, signal) => c.get("/roles", RolePage, all, { signal }),
    enabled,
  );
}

export function usePermissions(enabled = true) {
  return useScopedQuery(
    queryKeys.m02.permissions,
    (c, signal) => c.get("/permissions", PermissionPage, all, { signal }),
    enabled,
  );
}

export function useRoleAssignments(enabled = true) {
  return useScopedQuery(
    queryKeys.m02.assignments,
    (c, signal) => c.get("/role-assignments", AssignmentPage, all, { signal }),
    enabled,
  );
}

export function useSessions() {
  return useScopedQuery(queryKeys.m02.sessions, (c, signal) =>
    c.get("/sessions", SessionPage, all, { signal }),
  );
}

export function useSsoProviders(enabled = true) {
  return useScopedQuery(
    queryKeys.m02.ssoProviders,
    (c, signal) => c.get("/sso-providers", SsoPage, all, { signal }),
    enabled,
  );
}

/** An online M02 write that refetches every M02 list afterwards. */
function useM02Mutation<TVars, TResult>(send: (vars: TVars) => Promise<TResult>) {
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: send,
    onSuccess: async () => {
      if (session) await qc.invalidateQueries({ queryKey: queryKeys.m02.all(session) });
    },
  });
}

export function useInviteUser() {
  const { client } = useServices();
  return useM02Mutation<InviteUserInput, User>((body) =>
    client.send("POST", "/users/invite", body, UserSchema),
  );
}

export function useSetUserStatus() {
  const { client } = useServices();
  return useM02Mutation<{ userId: string; status: "active" | "suspended" }, User>(
    ({ userId, status }) =>
      client.send("PUT", `/users/${enc(userId)}/status`, { status }, UserSchema),
  );
}

/** Creates (`id` omitted) or updates a custom role. */
export function useSaveRole() {
  const { client } = useServices();
  return useM02Mutation<{ id?: string; data: RoleInput }, Role>(({ id, data }) =>
    id
      ? client.send("PUT", `/roles/${enc(id)}`, data, RoleSchema)
      : client.send("POST", "/roles", data, RoleSchema),
  );
}

export function useAssignRole() {
  const { client } = useServices();
  return useM02Mutation<AssignmentInput, RoleAssignment>((body) =>
    client.send("POST", "/role-assignments", body, RoleAssignmentSchema),
  );
}

const NoContent = { parse: () => null };

export function useRemoveAssignment() {
  const { client } = useServices();
  return useM02Mutation<string, null>((id) =>
    client.send("DELETE", `/role-assignments/${enc(id)}`, undefined, NoContent),
  );
}

export function useRevokeSession() {
  const { client } = useServices();
  return useM02Mutation<string, Session>((id) =>
    client.send("DELETE", `/sessions/${enc(id)}`, undefined, SessionSchema),
  );
}

/** Creates (`id` omitted) or updates an SSO provider. */
export function useSaveSsoProvider() {
  const { client } = useServices();
  return useM02Mutation<{ id?: string; data: SsoProviderInput }, SsoProvider>(({ id, data }) =>
    id
      ? client.send("PUT", `/sso-providers/${enc(id)}`, data, SsoProviderSchema)
      : client.send("POST", "/sso-providers", data, SsoProviderSchema),
  );
}
