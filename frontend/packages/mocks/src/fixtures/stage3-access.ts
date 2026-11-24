import type { Entitlement, ModuleId, Permission, PermissionCode } from "@nexus/contracts";
import type { SystemRoleKey } from "./ids";
import { DEMO_TENANTS } from "./tenants";

const perm = (code: PermissionCode, descriptionKey: string, sensitive = false): Permission => ({
  code,
  moduleId: code.slice(0, 3).toUpperCase(),
  sensitive,
  descriptionKey,
});

export const STAGE3_PERMISSIONS: readonly Permission[] = [
  perm("m08.config.read", "m08.permission.configRead"),
  perm("m08.config.manage", "m08.permission.configManage"),
  perm("m13.learner.read", "m13.permission.learnerRead"),
  perm("m13.learner.read_restricted", "m13.permission.learnerReadRestricted", true),
  perm("m13.learner.manage", "m13.permission.learnerManage"),
  perm("m14.family.read", "m14.permission.familyRead"),
  perm("m14.family.read_restricted", "m14.permission.familyReadRestricted", true),
  perm("m14.family.manage", "m14.permission.familyManage"),
  perm("m15.structure.read", "m15.permission.structureRead"),
  perm("m15.structure.manage", "m15.permission.structureManage"),
];

const all = STAGE3_PERMISSIONS.map((permission) => permission.code);

export const STAGE3_ROLE_PERMISSIONS: Record<SystemRoleKey, PermissionCode[]> = {
  owner: [...all],
  admin: [...all],
  teacher: ["m08.config.read", "m13.learner.read", "m14.family.read", "m15.structure.read"],
  guardian: ["m15.structure.read"],
  learner: ["m15.structure.read"],
};

const modules: readonly ModuleId[] = ["M08", "M13", "M14", "M15"];

export const STAGE3_ENTITLEMENTS: readonly Entitlement[] = DEMO_TENANTS.flatMap(({ tenantId }) =>
  modules.map((moduleId) => ({
    tenantId,
    moduleId,
    enabled: true,
    source: "core",
    expiresAt: null,
  })),
);
