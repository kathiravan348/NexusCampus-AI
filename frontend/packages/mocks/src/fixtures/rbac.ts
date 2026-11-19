import type {
  Permission,
  PermissionCode,
  Role,
  RoleAssignment,
  RoleScope,
  ScopeKind,
} from "@nexus/contracts";
import { CAMPUS, GROUP, INSTITUTION, TENANT, USER, roleId, type SystemRoleKey } from "./ids";
import { CREATED_AT, DEMO_TENANTS } from "./tenants";

const perm = (code: PermissionCode, descriptionKey: string, sensitive = false): Permission => ({
  code,
  moduleId: code.slice(0, 3).toUpperCase(),
  sensitive,
  descriptionKey,
});

/** Permission catalogue for the Stage 1 modules. `sensitive` = restricted data, audited on read (G-6). */
export const PERMISSIONS: readonly Permission[] = [
  perm("m01.institution.read", "m01.permission.institutionRead"),
  perm("m01.institution.manage", "m01.permission.institutionManage"),
  perm("m01.calendar.manage", "m01.permission.calendarManage"),
  perm("m02.user.read", "m02.permission.userRead"),
  perm("m02.user.invite", "m02.permission.userInvite"),
  perm("m02.role.manage", "m02.permission.roleManage"),
  perm("m02.person.read_restricted", "m02.permission.personReadRestricted", true),
  perm("m02.sso.manage", "m02.permission.ssoManage"),
  perm("m03.theme.manage", "m03.permission.themeManage"),
  perm("m04.text.manage", "m04.permission.textManage"),
  perm("m05.plan.read", "m05.permission.planRead"),
  perm("m05.module.manage", "m05.permission.moduleManage"),
  perm("m06.audit.read", "m06.permission.auditRead"),
  perm("m06.consent.manage", "m06.permission.consentManage"),
  perm("m06.request.manage", "m06.permission.requestManage", true),
  perm("m07.template.manage", "m07.permission.templateManage"),
  perm("m07.notification.send", "m07.permission.notificationSend"),
  perm("m07.preference.manage", "m07.permission.preferenceManage"),
  perm("m10.device.read", "m10.permission.deviceRead"),
  perm("m10.device.wipe", "m10.permission.deviceWipe"),
  perm("m11.assist.use", "m11.permission.assistUse"),
  perm("m11.settings.manage", "m11.permission.settingsManage"),
  perm("m83.vault.read", "m83.permission.vaultRead"),
  perm("m83.grant.approve", "m83.permission.grantApprove", true),
];

const ALL = PERMISSIONS.map((p) => p.code);

interface SystemRoleDef {
  readonly name: string;
  readonly permissions: readonly PermissionCode[];
  readonly allowedScopeKinds: readonly ScopeKind[];
}

/** The 5 system roles every tenant gets. Only `owner` may approve provider access (D22). */
const SYSTEM_ROLES: Readonly<Record<SystemRoleKey, SystemRoleDef>> = {
  owner: { name: "Owner", permissions: ALL, allowedScopeKinds: ["group", "institution"] },
  admin: {
    name: "Administrator",
    permissions: ALL.filter((c) => c !== "m83.grant.approve"),
    allowedScopeKinds: ["group", "institution", "campus"],
  },
  teacher: {
    name: "Teacher",
    permissions: [
      "m01.institution.read",
      "m02.user.read",
      "m07.notification.send",
      "m07.preference.manage",
      "m10.device.read",
      "m11.assist.use",
    ],
    allowedScopeKinds: ["institution", "campus", "department", "class"],
  },
  guardian: {
    name: "Guardian",
    permissions: ["m06.consent.manage", "m07.preference.manage", "m11.assist.use"],
    allowedScopeKinds: ["own"],
  },
  learner: {
    name: "Learner",
    permissions: ["m07.preference.manage", "m11.assist.use"],
    allowedScopeKinds: ["own"],
  },
};

export const ROLES: readonly Role[] = DEMO_TENANTS.flatMap((t) =>
  (Object.keys(SYSTEM_ROLES) as SystemRoleKey[]).map((key) => ({
    id: roleId(t.tenantId, key),
    tenantId: t.tenantId,
    name: SYSTEM_ROLES[key].name,
    system: true,
    permissions: [...SYSTEM_ROLES[key].permissions],
    allowedScopeKinds: [...SYSTEM_ROLES[key].allowedScopeKinds],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  })),
);

const OWN: RoleScope = { kind: "own", targetId: null };
const institution = (id: string): RoleScope => ({ kind: "institution", targetId: id });
const campus = (id: string): RoleScope => ({ kind: "campus", targetId: id });

const assign = (
  tenantId: string,
  userId: string,
  key: SystemRoleKey,
  scope: RoleScope,
  grantedBy: string,
): RoleAssignment => ({
  id: `ra-${userId.replace(/^usr-/, "")}-${key}`,
  tenantId,
  userId,
  roleId: roleId(tenantId, key),
  scope,
  academicYearId: null,
  effectiveFrom: "2026-01-15",
  effectiveTo: null,
  grantedBy,
  createdAt: CREATED_AT,
});

const LS = TENANT.littleSteps;
const RV = TENANT.riverside;
const NB = TENANT.northbridge;
const AX = TENANT.apex;
const HM = TENANT.harmony;

/** Each tenant's first admin bootstraps their own owner role (granted by themselves). */
export const ROLE_ASSIGNMENTS: readonly RoleAssignment[] = [
  assign(LS, USER.lsPriya, "owner", institution(INSTITUTION.littleSteps), USER.lsPriya),
  assign(LS, USER.lsPriya, "admin", institution(INSTITUTION.littleSteps), USER.lsPriya),
  assign(LS, USER.lsArjun, "teacher", campus(CAMPUS.littleSteps), USER.lsPriya),
  assign(LS, USER.lsArjun, "guardian", OWN, USER.lsPriya),
  assign(LS, USER.lsSunita, "guardian", OWN, USER.lsPriya),
  assign(LS, USER.lsDeepak, "guardian", OWN, USER.lsPriya),

  assign(RV, USER.rvHelen, "owner", { kind: "group", targetId: GROUP.riverside }, USER.rvHelen),
  assign(RV, USER.rvHelen, "admin", { kind: "group", targetId: GROUP.riverside }, USER.rvHelen),
  assign(RV, USER.rvTom, "teacher", campus(CAMPUS.riversideNorth), USER.rvHelen),
  assign(RV, USER.rvAmira, "teacher", campus(CAMPUS.riversideSouth), USER.rvHelen),
  assign(RV, USER.rvAmira, "guardian", OWN, USER.rvHelen),
  assign(RV, USER.rvGrace, "guardian", OWN, USER.rvHelen),
  assign(RV, USER.rvDaniel, "guardian", OWN, USER.rvHelen),
  assign(RV, USER.rvOliver, "learner", OWN, USER.rvHelen),

  assign(NB, USER.nbRobert, "owner", institution(INSTITUTION.northbridge), USER.nbRobert),
  assign(NB, USER.nbRobert, "admin", institution(INSTITUTION.northbridge), USER.nbRobert),
  assign(NB, USER.nbElena, "teacher", institution(INSTITUTION.northbridge), USER.nbRobert),
  assign(NB, USER.nbMarcus, "teacher", institution(INSTITUTION.northbridge), USER.nbRobert),
  assign(NB, USER.nbMarcus, "guardian", OWN, USER.nbRobert),
  assign(NB, USER.nbPatricia, "guardian", OWN, USER.nbRobert),
  assign(NB, USER.nbJordan, "learner", OWN, USER.nbRobert),
  assign(NB, USER.nbSofia, "learner", OWN, USER.nbRobert),

  assign(AX, USER.axKhalid, "owner", institution(INSTITUTION.apex), USER.axKhalid),
  assign(AX, USER.axKhalid, "admin", institution(INSTITUTION.apex), USER.axKhalid),
  assign(AX, USER.axFatima, "teacher", campus(CAMPUS.apex), USER.axKhalid),
  assign(AX, USER.axFatima, "guardian", OWN, USER.axKhalid),
  assign(AX, USER.axOmar, "teacher", campus(CAMPUS.apex), USER.axKhalid),
  assign(AX, USER.axLayla, "guardian", OWN, USER.axKhalid),
  assign(AX, USER.axAhmed, "learner", OWN, USER.axKhalid),

  assign(HM, USER.hmWeiLing, "owner", institution(INSTITUTION.harmony), USER.hmWeiLing),
  assign(HM, USER.hmWeiLing, "admin", institution(INSTITUTION.harmony), USER.hmWeiLing),
  assign(HM, USER.hmDaniel, "teacher", campus(CAMPUS.harmony), USER.hmWeiLing),
  assign(HM, USER.hmDaniel, "guardian", OWN, USER.hmWeiLing),
  assign(HM, USER.hmPriya, "teacher", campus(CAMPUS.harmony), USER.hmWeiLing),
  assign(HM, USER.hmMei, "guardian", OWN, USER.hmWeiLing),
  assign(HM, USER.hmRachel, "learner", OWN, USER.hmWeiLing),
];

/** One entry in the demo persona switch (NEX-012). `labelKey` is an `@nexus/i18n` message key. */
export interface DemoPersona {
  readonly tenantId: string;
  readonly userId: string;
  readonly labelKey: string;
  readonly roleId: string;
}

const persona = (tenantId: string, userId: string, key: SystemRoleKey): DemoPersona => ({
  tenantId,
  userId,
  labelKey: `m02.persona.${key}`,
  roleId: roleId(tenantId, key),
});

/** Personas per tenant: admin, teacher, guardian, and a learner where learners sign in (not EY). */
export const DEMO_PERSONAS: readonly DemoPersona[] = [
  persona(LS, USER.lsPriya, "admin"),
  persona(LS, USER.lsArjun, "teacher"),
  persona(LS, USER.lsSunita, "guardian"),
  persona(RV, USER.rvHelen, "admin"),
  persona(RV, USER.rvTom, "teacher"),
  persona(RV, USER.rvGrace, "guardian"),
  persona(RV, USER.rvOliver, "learner"),
  persona(NB, USER.nbRobert, "admin"),
  persona(NB, USER.nbElena, "teacher"),
  persona(NB, USER.nbPatricia, "guardian"),
  persona(NB, USER.nbJordan, "learner"),
  persona(AX, USER.axKhalid, "admin"),
  persona(AX, USER.axFatima, "teacher"),
  persona(AX, USER.axLayla, "guardian"),
  persona(AX, USER.axAhmed, "learner"),
  persona(HM, USER.hmWeiLing, "admin"),
  persona(HM, USER.hmDaniel, "teacher"),
  persona(HM, USER.hmMei, "guardian"),
  persona(HM, USER.hmRachel, "learner"),
];
