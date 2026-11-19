import { describe, expect, it } from "vitest";
import {
  PermissionCodeSchema,
  PermissionSchema,
  RoleAssignmentSchema,
  RoleSchema,
  RoleScopeSchema,
  ScopeKindSchema,
} from "./rbac";

const permission = {
  code: "m02.user.invite",
  moduleId: "M02",
  sensitive: false,
  descriptionKey: "m02.permission.userInvite",
};

const role = {
  id: "role_class_teacher",
  tenantId: "ten_riverside_group",
  name: "Class teacher",
  system: true,
  permissions: ["m02.user.view", "m17.roll.mark"],
  allowedScopeKinds: ["class", "own"],
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const assignment = {
  id: "ra_01",
  tenantId: "ten_riverside_group",
  userId: "usr_asha",
  roleId: "role_class_teacher",
  scope: { kind: "class", targetId: "cls_5b" },
  academicYearId: "ay_2026",
  effectiveFrom: "2026-06-01",
  effectiveTo: "2027-05-31",
  grantedBy: "usr_principal",
  createdAt: "2026-06-01T00:00:00Z",
};

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

describe("PermissionCode and Permission", () => {
  it("codes are <module>.<resource>.<action> in lower case", () => {
    for (const c of ["m02.user.invite", "p10.grant.approve", "m83.access_request.deny"])
      expect(PermissionCodeSchema.safeParse(c).success, c).toBe(true);
    rejects(PermissionCodeSchema, [
      "M02.user.invite",
      "m02.user",
      "m00.user.view",
      "m02.User.invite",
      "",
    ]);
  });

  it("accepts a permission whose code starts with its module", () => {
    expect(PermissionSchema.safeParse(permission).success).toBe(true);
    expect(
      PermissionSchema.safeParse({
        code: "p10.grant.approve",
        moduleId: "P10",
        sensitive: true,
        descriptionKey: "p10.permission.grantApprove",
      }).success,
    ).toBe(true);
  });

  it("rejects a mismatched module prefix, bad keys and extra keys", () => {
    rejects(PermissionSchema, [
      { ...permission, moduleId: "M03" },
      { ...permission, moduleId: "m02" },
      { ...permission, descriptionKey: "Invite users" },
      { ...permission, label: "Invite" },
    ]);
  });
});

describe("RoleScope", () => {
  it("own has no target; every other kind has one", () => {
    expect(RoleScopeSchema.safeParse({ kind: "own", targetId: null }).success).toBe(true);
    for (const kind of ScopeKindSchema.options.filter((k) => k !== "own"))
      expect(RoleScopeSchema.safeParse({ kind, targetId: "x_1" }).success, kind).toBe(true);
    rejects(RoleScopeSchema, [
      { kind: "own", targetId: "usr_asha" },
      { kind: "campus", targetId: null },
      { kind: "school", targetId: "x_1" },
      { kind: "own", targetId: null, extra: 1 },
    ]);
  });
});

describe("Role", () => {
  it("accepts a role with unique permissions and scope kinds", () => {
    expect(RoleSchema.safeParse(role).success).toBe(true);
  });

  it("rejects empty or duplicate lists, bad codes, times and extra keys", () => {
    rejects(RoleSchema, [
      { ...role, permissions: [] },
      { ...role, permissions: ["m02.user.view", "m02.user.view"] },
      { ...role, permissions: ["users:view"] },
      { ...role, allowedScopeKinds: [] },
      { ...role, allowedScopeKinds: ["class", "class"] },
      { ...role, updatedAt: "2026-05-01T00:00:00Z" },
      { ...role, color: "blue" },
    ]);
  });
});

describe("RoleAssignment", () => {
  it("accepts year-scoped and open-ended own-scope assignments", () => {
    expect(RoleAssignmentSchema.safeParse(assignment).success).toBe(true);
    expect(
      RoleAssignmentSchema.safeParse({
        ...assignment,
        scope: { kind: "own", targetId: null },
        academicYearId: null,
        effectiveTo: null,
      }).success,
    ).toBe(true);
  });

  it("rejects effectiveTo before effectiveFrom, bad scopes and extra keys", () => {
    rejects(RoleAssignmentSchema, [
      { ...assignment, effectiveTo: "2026-05-31" },
      { ...assignment, scope: { kind: "own", targetId: "usr_asha" } },
      { ...assignment, scope: { kind: "class", targetId: null } },
      { ...assignment, effectiveFrom: "June 2026" },
      { ...assignment, permissions: [] },
    ]);
  });
});
