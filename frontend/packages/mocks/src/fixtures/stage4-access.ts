import type {
  Entitlement,
  InstitutionType,
  ModuleId,
  Permission,
  PermissionCode,
} from "@nexus/contracts";
import type { MessageKey } from "@nexus/i18n/resolve";
import { roleId, SYSTEM_ROLE_KEYS, type SystemRoleKey } from "./ids";
import { ROLES } from "./rbac";
import { DEMO_TENANTS } from "./tenants";

const perm = (code: PermissionCode, descriptionKey: MessageKey, sensitive = false): Permission => ({
  code,
  moduleId: code.slice(0, 3).toUpperCase(),
  sensitive,
  descriptionKey,
});

export const STAGE4_PERMISSIONS: readonly Permission[] = [
  perm("m29.curriculum.read", "m29.permission.curriculumRead"),
  perm("m29.curriculum.manage", "m29.permission.curriculumManage"),
  perm("m29.lessonplan.write", "m29.permission.lessonplanWrite"),
  perm("m29.lessonplan.review", "m29.permission.lessonplanReview"),
  perm("m30.course.read", "m30.permission.courseRead"),
  perm("m30.course.manage", "m30.permission.courseManage"),
  perm("m30.discussion.moderate", "m30.permission.discussionModerate"),
  perm("m31.content.read", "m31.permission.contentRead"),
  perm("m31.content.manage", "m31.permission.contentManage"),
  perm("m31.content.publish", "m31.permission.contentPublish"),
  perm("m32.assignment.read", "m32.permission.assignmentRead"),
  perm("m32.assignment.manage", "m32.permission.assignmentManage"),
  perm("m32.submission.mark", "m32.permission.submissionMark", true),
  perm("m33.test.read", "m33.permission.testRead"),
  perm("m33.test.manage", "m33.permission.testManage"),
  perm("m33.bank.manage", "m33.permission.bankManage"),
  perm("m33.response.mark", "m33.permission.responseMark", true),
  perm("m34.proctoring.manage", "m34.permission.proctoringManage"),
  perm("m34.flag.review", "m34.permission.flagReview", true),
  perm("m35.tutor.manage", "m35.permission.tutorManage"),
  perm("m35.mastery.read", "m35.permission.masteryRead", true),
  perm("m35.transcript.read", "m35.permission.transcriptRead", true),
  perm("m36.live.read", "m36.permission.liveRead"),
  perm("m36.live.host", "m36.permission.liveHost"),
  perm("m37.diary.read", "m37.permission.diaryRead", true),
  perm("m37.diary.record", "m37.permission.diaryRecord", true),
  perm("m37.pickup.check", "m37.permission.pickupCheck", true),
  perm("m38.plan.read", "m38.permission.planRead", true),
  perm("m38.plan.manage", "m38.permission.planManage", true),
  perm("m39.library.read", "m39.permission.libraryRead"),
  perm("m39.catalogue.manage", "m39.permission.catalogueManage"),
  perm("m39.circulation.manage", "m39.permission.circulationManage"),
  perm("m40.series.read", "m40.permission.seriesRead"),
  perm("m40.series.manage", "m40.permission.seriesManage"),
  perm("m40.doubt.answer", "m40.permission.doubtAnswer"),
  perm("m41.course.read", "m41.permission.courseRead"),
  perm("m41.course.manage", "m41.permission.courseManage"),
  perm("m41.booking.manage", "m41.permission.bookingManage"),
  perm("m42.registration.read", "m42.permission.registrationRead"),
  perm("m42.registration.decide", "m42.permission.registrationDecide"),
  perm("m42.audit.read", "m42.permission.auditRead", true),
  perm("m43.store.read", "m43.permission.storeRead"),
  perm("m43.store.manage", "m43.permission.storeManage"),
  perm("m43.order.read", "m43.permission.orderRead", true),
  perm("m44.survey.read", "m44.permission.surveyRead"),
  perm("m44.survey.manage", "m44.permission.surveyManage"),
  perm("m44.results.read", "m44.permission.resultsRead", true),
  perm("m45.credential.read", "m45.permission.credentialRead"),
  perm("m45.credential.issue", "m45.permission.credentialIssue", true),
  perm("m46.risk.read", "m46.permission.riskRead", true),
  perm("m46.intervention.manage", "m46.permission.interventionManage", true),
  perm("m91.media.read", "m91.permission.mediaRead"),
  perm("m91.media.manage", "m91.permission.mediaManage"),
  perm("m91.portfolio.read", "m91.permission.portfolioRead"),
];

const all = STAGE4_PERMISSIONS.map(({ code }) => code);

export const STAGE4_ROLE_PERMISSIONS: Readonly<Record<SystemRoleKey, readonly PermissionCode[]>> = {
  owner: all,
  admin: all,
  teacher: [
    "m29.curriculum.read",
    "m29.lessonplan.write",
    "m30.course.read",
    "m30.discussion.moderate",
    "m31.content.read",
    "m31.content.manage",
    "m32.assignment.read",
    "m32.assignment.manage",
    "m32.submission.mark",
    "m33.test.read",
    "m33.test.manage",
    "m33.bank.manage",
    "m33.response.mark",
    "m35.mastery.read",
    "m36.live.read",
    "m36.live.host",
    "m37.diary.read",
    "m37.diary.record",
    "m37.pickup.check",
    "m38.plan.read",
    "m39.library.read",
    "m40.series.read",
    "m40.doubt.answer",
    "m41.course.read",
    "m42.registration.read",
    "m42.audit.read",
    "m43.store.read",
    "m43.order.read",
    "m44.survey.read",
    "m44.results.read",
    "m45.credential.read",
    "m46.risk.read",
    "m91.media.read",
    "m91.media.manage",
    "m91.portfolio.read",
  ],
  guardian: [
    "m37.diary.read",
    "m39.library.read",
    "m44.survey.read",
    "m45.credential.read",
    "m91.portfolio.read",
  ],
  learner: [
    "m30.course.read",
    "m31.content.read",
    "m32.assignment.read",
    "m33.test.read",
    "m36.live.read",
    "m39.library.read",
    "m44.survey.read",
    "m45.credential.read",
    "m91.portfolio.read",
  ],
};

// Institution-type availability follows the Stage 4 rows of docs/MODULES.md.
const allTypes: readonly ModuleId[] = [
  "M29",
  "M30",
  "M31",
  "M32",
  "M33",
  "M35",
  "M36",
  "M38",
  "M39",
  "M44",
  "M45",
  "M46",
];

const byType: Readonly<Record<InstitutionType, readonly ModuleId[]>> = {
  ey: ["M37", "M91"],
  k12: ["M91"],
  he: ["M34", "M42"],
  voc: ["M42", "M91"],
  tp: ["M34", "M40", "M43"],
  sk: ["M41", "M43", "M91"],
  onl: ["M34", "M41", "M43"],
  grp: [],
};

export const STAGE4_ENTITLEMENTS: readonly Entitlement[] = DEMO_TENANTS.flatMap(
  ({ tenantId, type }) =>
    [...allTypes, ...byType[type]].map((moduleId) => ({
      tenantId,
      moduleId,
      enabled: true,
      source: "plan",
      expiresAt: null,
    })),
);

/** Stage 4 access additions for the mock database. Roles carry only their Stage 4 grants. */
export function stage4AccessFixtures() {
  return {
    permissions: [...STAGE4_PERMISSIONS],
    roles: ROLES.flatMap((role) => {
      const key = SYSTEM_ROLE_KEYS.find((key) => role.id === roleId(role.tenantId, key));
      return role.system && key
        ? [{ ...role, permissions: [...STAGE4_ROLE_PERMISSIONS[key]] }]
        : [];
    }),
    entitlements: [...STAGE4_ENTITLEMENTS],
  };
}
