import {
  PermissionCodeSchema,
  PersonSchema,
  RoleAssignmentSchema,
  RoleProfileSchema,
  UserSchema,
} from "@nexus/contracts";
import { z } from "zod";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

/** The signed-in user: account, person (masked per G-6), memberships, roles and resolved permissions. */
export const MeResponseSchema = z.strictObject({
  user: UserSchema,
  person: PersonSchema,
  roleProfiles: z.array(RoleProfileSchema),
  assignments: z.array(RoleAssignmentSchema),
  permissions: z.array(PermissionCodeSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export function useMe() {
  return useScopedQuery(queryKeys.m02.me, (client, signal) =>
    client.get("/me", MeResponseSchema, undefined, { signal }),
  );
}
