import type { Entitlement, ModuleId, Permission, PermissionCode } from "@nexus/contracts";
import { roleId, type SystemRoleKey } from "./ids";
import { ENTITLEMENTS } from "./plans";
import { PERMISSIONS, ROLES } from "./rbac";
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
  perm("m09.import.read", "m09.permission.importRead"),
  perm("m09.import.manage", "m09.permission.importManage"),
  perm("m12.admissions.read", "m12.permission.admissionsRead"),
  perm("m12.admissions.manage", "m12.permission.admissionsManage"),
  perm("m16.timetable.read", "m16.permission.timetableRead"),
  perm("m16.timetable.manage", "m16.permission.timetableManage"),
  perm("m17.attendance.read", "m17.permission.attendanceRead"),
  perm("m17.attendance.mark", "m17.permission.attendanceMark", true),
  perm("m17.leave.decide", "m17.permission.leaveDecide", true),
  perm("m18.fees.read", "m18.permission.feesRead", true),
  perm("m18.fees.manage", "m18.permission.feesManage", true),
  perm("m19.accounts.read", "m19.permission.accountsRead"),
  perm("m19.accounts.manage", "m19.permission.accountsManage", true),
  perm("m20.marks.read", "m20.permission.marksRead", true),
  perm("m20.marks.enter", "m20.permission.marksEnter", true),
  perm("m21.exams.read", "m21.permission.examsRead", true),
  perm("m21.exams.manage", "m21.permission.examsManage", true),
  perm("m22.reports.read", "m22.permission.reportsRead", true),
  perm("m22.reports.publish", "m22.permission.reportsPublish", true),
  perm("m23.documents.read", "m23.permission.documentsRead", true),
  perm("m23.documents.issue", "m23.permission.documentsIssue", true),
  perm("m24.messages.read", "m24.permission.messagesRead", true),
  perm("m24.messages.send", "m24.permission.messagesSend", true),
  perm("m24.notices.read", "m24.permission.noticesRead"),
  perm("m24.notices.publish", "m24.permission.noticesPublish"),
  perm("m24.meetings.read", "m24.permission.meetingsRead", true),
  perm("m24.meetings.manage", "m24.permission.meetingsManage", true),
  perm("m28.dashboards.read", "m28.permission.dashboardsRead"),
  perm("m86.rollover.read", "m86.permission.rolloverRead"),
  perm("m86.rollover.manage", "m86.permission.rolloverManage"),
];

const all = STAGE3_PERMISSIONS.map((permission) => permission.code);

export const STAGE3_ROLE_PERMISSIONS: Record<SystemRoleKey, PermissionCode[]> = {
  owner: [...all],
  admin: [...all],
  teacher: [
    "m08.config.read",
    "m13.learner.read",
    "m14.family.read",
    "m15.structure.read",
    "m16.timetable.read",
    "m17.attendance.read",
    "m17.attendance.mark",
    "m20.marks.read",
    "m20.marks.enter",
    "m21.exams.read",
    "m22.reports.read",
    "m24.messages.read",
    "m24.messages.send",
    "m24.notices.read",
    "m24.meetings.read",
  ],
  guardian: [
    "m15.structure.read",
    "m16.timetable.read",
    "m24.messages.read",
    "m24.messages.send",
    "m24.notices.read",
    "m24.meetings.read",
  ],
  learner: [
    "m15.structure.read",
    "m16.timetable.read",
    "m24.messages.read",
    "m24.messages.send",
    "m24.notices.read",
  ],
};

const modules: readonly ModuleId[] = [
  "M08",
  "M09",
  "M12",
  "M13",
  "M14",
  "M15",
  "M16",
  "M17",
  "M18",
  "M19",
  "M20",
  "M21",
  "M22",
  "M23",
  "M24",
  "M25",
  "M26",
  "M27",
  "M28",
  "M86",
];

export const STAGE3_ENTITLEMENTS: readonly Entitlement[] = DEMO_TENANTS.flatMap(({ tenantId }) =>
  modules.map((moduleId) => ({
    tenantId,
    moduleId,
    enabled: true,
    source: "core",
    expiresAt: null,
  })),
);

/** Shared by the demo seed export and the mutable mock database. */
export function demoAccessFixtures() {
  const grants = Object.entries(STAGE3_ROLE_PERMISSIONS);
  return {
    permissions: [...PERMISSIONS, ...STAGE3_PERMISSIONS],
    roles: ROLES.map((role) => {
      const match = role.system
        ? grants.find(([key]) => role.id === roleId(role.tenantId, key as SystemRoleKey))
        : undefined;
      return match ? { ...role, permissions: [...role.permissions, ...match[1]] } : role;
    }),
    entitlements: [...ENTITLEMENTS, ...STAGE3_ENTITLEMENTS],
  };
}
