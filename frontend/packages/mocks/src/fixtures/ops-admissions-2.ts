import type {
  ColumnMapping,
  DryRunReport,
  ImportJob,
  ImportRowIssue,
  PromotionAction,
  PromotionDecision,
  RolloverCounts,
  RolloverRun,
} from "@nexus/contracts";
import { LEARNER_FIELD } from "./config";
import { CALENDAR, INSTITUTION, PERSON, TENANT } from "./ids";
import {
  CLASS_GROUP,
  IMPORT_JOB,
  LEARNER,
  NEXT_ACADEMIC_YEAR,
  type OpsTenantSlug,
  promotionDecisionId,
  ROLLOVER_RUN,
} from "./ids-stage3";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

type TenantSpec = readonly [
  slug: OpsTenantSlug,
  tenantId: string,
  institutionId: string,
  academicYearId: string,
  adminPersonId: string,
];

const TENANTS: readonly TenantSpec[] = [
  ["ls", TENANT.littleSteps, INSTITUTION.littleSteps, CALENDAR.littleSteps, PERSON.lsPriya],
  ["rv", TENANT.riverside, INSTITUTION.riversideSchool, CALENDAR.riversideSchool, PERSON.rvHelen],
  ["nb", TENANT.northbridge, INSTITUTION.northbridge, CALENDAR.northbridge, PERSON.nbRobert],
  ["ax", TENANT.apex, INSTITUTION.apex, CALENDAR.apex, PERSON.axKarthik],
  ["hm", TENANT.harmony, INSTITUTION.harmony, CALENDAR.harmony, PERSON.hmWeiLing],
];

type DecisionSpec = readonly [
  learnerId: string,
  action: PromotionAction,
  toClassGroupId: string | null,
  reasonKey: string | null,
];

const DECISION_SPECS: Readonly<Record<OpsTenantSlug, readonly DecisionSpec[]>> = {
  ls: [
    [LEARNER.lsKavya, "promote", CLASS_GROUP.lsExplorer, null],
    [LEARNER.lsIshaan, "promote", CLASS_GROUP.lsExplorer, null],
    [LEARNER.lsRohan, "graduate", null, null],
    [LEARNER.lsAnaya, "detain", CLASS_GROUP.lsExplorer, "m86.promotion.ageEligibility"],
  ],
  rv: [
    [LEARNER.rvMia, "promote", CLASS_GROUP.rvSouthYearSeven, null],
    [LEARNER.rvLeo, "promote", CLASS_GROUP.rvNorthYearNine, null],
    [LEARNER.rvElla, "promote", CLASS_GROUP.rvNorthYearTen, null],
    [LEARNER.rvOliver, "graduate", null, null],
  ],
  nb: [
    [LEARNER.nbJordan, "promote", CLASS_GROUP.nbSecondYear, null],
    [LEARNER.nbSofia, "promote", CLASS_GROUP.nbSecondYear, null],
    [LEARNER.nbAiden, "graduate", null, null],
    [LEARNER.nbNora, "skip", null, "m86.promotion.leaveOfAbsence"],
  ],
  ax: [
    [LEARNER.axVijay, "promote", CLASS_GROUP.axAdvanced, null],
    [LEARNER.axDivya, "promote", CLASS_GROUP.axAdvanced, null],
    [LEARNER.axArun, "graduate", null, null],
    [LEARNER.axNila, "transfer", null, "m86.promotion.batchTransfer"],
  ],
  hm: [
    [LEARNER.hmEthan, "promote", CLASS_GROUP.hmIntermediate, null],
    [LEARNER.hmChloe, "promote", CLASS_GROUP.hmIntermediate, null],
    [LEARNER.hmRachel, "graduate", null, null],
    [LEARNER.hmMarcus, "detain", CLASS_GROUP.hmIntermediate, "m86.promotion.extraPractice"],
  ],
};

const built = TENANTS.map(([slug, tenantId, institutionId, academicYearId, adminPersonId]) => {
  const adminStaff = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === adminPersonId && p.kind === "staff",
  );
  if (!adminStaff) throw new Error(`Missing staff profile for ${adminPersonId}`);

  const [completedJobId, dryRunJobId] = IMPORT_JOB[slug];
  const importJobs: ImportJob[] = [
    {
      id: completedJobId,
      tenantId,
      entity: "learner",
      fileName: "learners-2026.csv",
      sourceFormat: "csv",
      templateVersion: 1,
      status: "completed",
      totalRows: 4,
      validRows: 4,
      errorRows: 0,
      createdByStaffProfileId: adminStaff.id,
      rollbackUntil: "2026-10-01T09:00:00Z",
      createdAt: "2026-09-01T09:00:00Z",
      updatedAt: "2026-09-01T09:05:00Z",
    },
    {
      id: dryRunJobId,
      tenantId,
      entity: "guardian",
      fileName: "guardians-intake.xlsx",
      sourceFormat: "xlsx",
      templateVersion: 1,
      status: "dry_run_ready",
      totalRows: 6,
      validRows: 5,
      errorRows: 1,
      createdByStaffProfileId: adminStaff.id,
      rollbackUntil: null,
      createdAt: "2026-11-10T09:00:00Z",
      updatedAt: "2026-11-10T09:02:00Z",
    },
  ];

  const columnMappings: ColumnMapping[] = [
    {
      jobId: completedJobId,
      columns: [
        { sourceHeader: "Full Name", target: "legalName", transform: "trim" },
        { sourceHeader: "Email", target: "email", transform: "lower" },
        {
          sourceHeader: "Study Interest",
          target: `custom:${LEARNER_FIELD.studyInterest}`,
          transform: "trim",
        },
      ],
    },
    {
      jobId: dryRunJobId,
      columns: [
        { sourceHeader: "Guardian Name", target: "legalName", transform: "trim" },
        { sourceHeader: "Mobile", target: "phone", transform: "phone_in" },
        { sourceHeader: "Notes", target: null, transform: "none" },
      ],
    },
  ];

  const issues: ImportRowIssue[] = [
    {
      rowNumber: 4,
      column: "Mobile",
      severity: "error",
      code: "invalid_phone",
      messageKey: "m09.import.invalidPhone",
    },
    {
      rowNumber: 2,
      column: "Guardian Name",
      severity: "warning",
      code: "duplicate_name",
      messageKey: "m09.import.duplicateName",
    },
  ];
  const dryRunReport: DryRunReport = {
    jobId: dryRunJobId,
    issues,
    truncated: false,
    wouldCreate: 4,
    wouldUpdate: 1,
  };

  const runId = ROLLOVER_RUN[slug];
  const decisions: PromotionDecision[] = DECISION_SPECS[slug].map(
    ([learnerId, action, toClassGroupId, reasonKey]) => ({
      id: promotionDecisionId(learnerId),
      tenantId,
      runId,
      learnerId,
      action,
      toClassGroupId,
      reasonKey,
      overriddenByStaffProfileId: reasonKey !== null ? adminStaff.id : null,
    }),
  );
  const counts: RolloverCounts = { promote: 0, detain: 0, graduate: 0, transfer: 0, skip: 0 };
  for (const d of decisions) counts[d.action] += 1;
  const run: RolloverRun = {
    id: runId,
    tenantId,
    institutionId,
    fromAcademicYearId: academicYearId,
    toAcademicYearId: NEXT_ACADEMIC_YEAR[slug],
    status: "dry_run_ready",
    counts,
    carryForwardFees: true,
    rollbackUntil: null,
    createdByStaffProfileId: adminStaff.id,
    ...timestamps,
  };

  return { importJobs, columnMappings, dryRunJobId, issues, dryRunReport, run, decisions };
});

export const IMPORT_JOBS: readonly ImportJob[] = built.flatMap((b) => b.importJobs);
export const COLUMN_MAPPINGS: readonly ColumnMapping[] = built.flatMap((b) => b.columnMappings);
export const IMPORT_ROW_ISSUES: Readonly<Record<string, readonly ImportRowIssue[]>> =
  Object.fromEntries(built.map((b) => [b.dryRunJobId, b.issues]));
export const DRY_RUN_REPORTS: readonly DryRunReport[] = built.map((b) => b.dryRunReport);
export const ROLLOVER_RUNS: readonly RolloverRun[] = built.map((b) => b.run);
export const PROMOTION_DECISIONS: readonly PromotionDecision[] = built.flatMap((b) => b.decisions);
