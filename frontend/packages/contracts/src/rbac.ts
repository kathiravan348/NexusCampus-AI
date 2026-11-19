import { z } from "zod";
import { IdSchema, IsoDateSchema, ModuleIdSchema, NameSchema, UtcDateTimeSchema } from "./common";

const notBefore = (from: string, to: string) => Date.parse(to) >= Date.parse(from);
const hasNoDuplicates = (values: readonly unknown[]) => new Set(values).size === values.length;

/** `<module>.<resource>.<action>` in lower case, e.g. `m02.user.invite` or `p10.grant.approve`. */
export const PermissionCodeSchema = z
  .string()
  .regex(/^[mp](0[1-9]|[1-9]\d)\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, {
    message: "Must be <module>.<resource>.<action>, e.g. m02.user.invite",
  });
export type PermissionCode = z.infer<typeof PermissionCodeSchema>;

/**
 * One permission in the catalogue. `sensitive` = grants access to restricted data (health, safeguarding,
 * ID fields — G-6) and is audited on read. `descriptionKey` is an `@nexus/i18n` message key.
 */
export const PermissionSchema = z
  .strictObject({
    code: PermissionCodeSchema,
    moduleId: ModuleIdSchema,
    sensitive: z.boolean(),
    descriptionKey: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/, {
      message: "Must be a message key, e.g. m02.permission.userInvite",
    }),
  })
  .refine((p) => p.code.startsWith(`${p.moduleId.toLowerCase()}.`), {
    message: "code must start with the permission's moduleId",
    path: ["code"],
  });
export type Permission = z.infer<typeof PermissionSchema>;

/** Where a role assignment applies (E-6). `own` = only the user's own records. */
export const ScopeKindSchema = z.enum([
  "group",
  "institution",
  "campus",
  "department",
  "class",
  "own",
]);
export type ScopeKind = z.infer<typeof ScopeKindSchema>;

/** `targetId` is the group / institution / campus / department / class id; null only for `own`. */
export const RoleScopeSchema = z
  .strictObject({
    kind: ScopeKindSchema,
    targetId: IdSchema.nullable(),
  })
  .refine((s) => (s.targetId === null) === (s.kind === "own"), {
    message: "targetId must be null for own scope and set for every other scope",
    path: ["targetId"],
  });
export type RoleScope = z.infer<typeof RoleScopeSchema>;

/** A named set of permissions. `system` roles ship with the product and cannot be edited by a tenant. */
export const RoleSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    name: NameSchema,
    system: z.boolean(),
    permissions: z.array(PermissionCodeSchema).min(1),
    allowedScopeKinds: z.array(ScopeKindSchema).min(1),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((r) => hasNoDuplicates(r.permissions), {
    message: "permissions has duplicates",
    path: ["permissions"],
  })
  .refine((r) => hasNoDuplicates(r.allowedScopeKinds), {
    message: "allowedScopeKinds has duplicates",
    path: ["allowedScopeKinds"],
  })
  .refine((r) => notBefore(r.createdAt, r.updatedAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type Role = z.infer<typeof RoleSchema>;

/**
 * A role given to a user in one scope, optionally for one academic year (D25 temporal scoping).
 * That `scope.kind` is in the role's `allowedScopeKinds` is checked by the server.
 */
export const RoleAssignmentSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    userId: IdSchema,
    roleId: IdSchema,
    scope: RoleScopeSchema,
    academicYearId: IdSchema.nullable(),
    effectiveFrom: IsoDateSchema,
    effectiveTo: IsoDateSchema.nullable(),
    grantedBy: IdSchema,
    createdAt: UtcDateTimeSchema,
  })
  .refine((a) => a.effectiveTo === null || notBefore(a.effectiveFrom, a.effectiveTo), {
    message: "effectiveTo is before effectiveFrom",
    path: ["effectiveTo"],
  });
export type RoleAssignment = z.infer<typeof RoleAssignmentSchema>;
