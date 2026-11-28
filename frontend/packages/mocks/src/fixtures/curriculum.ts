import type {
  CoverageEntry,
  CoverageStatus,
  LessonPlan,
  LessonPlanSource,
  LessonPlanStatus,
  Outcome,
  OutcomeFramework,
  OutcomeFrameworkKind,
  OutcomeMapping,
  SyllabusUnit,
} from "@nexus/contracts";
import { SUBJECT_OFFERINGS } from "./academics";
import { INSTITUTION as I, PERSON, TENANT as T } from "./ids";
import { OFFERING as OFF, SUBJECT as S, YEAR_LEVEL as Y } from "./ids-stage3";
import {
  COVERAGE_ENTRY as COV,
  LESSON_PLAN as LP,
  OUTCOME as O,
  OUTCOME_FRAMEWORK as FW,
  OUTCOME_MAPPING as OM,
  SYLLABUS_TOPIC as ST,
  SYLLABUS_UNIT as SU,
} from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };
const caseGuid = (n: number): string => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const rvCaseUri = "https://standards.example.edu/case/rv-core-2026";
function findStaffId(personId: string): string {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "staff");
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
}
const rvHelen = findStaffId(PERSON.rvHelen);

type FwRow = readonly [
  string,
  string,
  string | null,
  string,
  string,
  OutcomeFrameworkKind,
  string?,
];

export const OUTCOME_FRAMEWORKS: readonly OutcomeFramework[] = (
  [
    [FW.lsMilestones, T.littleSteps, I.littleSteps, "EY-MILE", "EY Milestones", "milestones"],
    [FW.rvStandards, T.riverside, null, "RV-STD", "Riverside Standards", "standards", rvCaseUri],
    [FW.nbCourseOutcomes, T.northbridge, I.northbridge, "CS-CO", "CS Outcomes", "course_outcomes"],
    [FW.nbProgramOutcomes, T.northbridge, I.northbridge, "BSCS-PO", "BSCS PO", "program_outcomes"],
    [FW.axSyllabus, T.apex, I.apex, "AX-EXAM", "STEM Exam Syllabus", "standards"],
    [FW.hmSkills, T.harmony, I.harmony, "HM-GRADES", "Graded Music Skills", "skills"],
  ] as readonly FwRow[]
).map(([id, tenantId, institutionId, code, name, kind, caseDocumentUri]) => ({
  id,
  tenantId,
  institutionId,
  code,
  name,
  kind,
  source: caseDocumentUri ? "case_import" : "local",
  caseDocumentUri: caseDocumentUri ?? null,
  version: "2026.1",
  active: true,
  ...ts,
}));

type OutRow = readonly [string, string, string, string, string, string?];

function out(
  tenantId: string,
  frameworkId: string,
  rows: readonly OutRow[],
  caseImport = false,
): Outcome[] {
  return rows.map(([id, code, statement, subjectId, yearLevelId, parentId], idx) => ({
    id,
    tenantId,
    frameworkId,
    parentId: parentId ?? null,
    code,
    statement,
    order: idx + 1,
    caseItemId: caseImport ? caseGuid(idx + 1) : null,
    subjectIds: [subjectId],
    yearLevelIds: [yearLevelId],
    ...ts,
  }));
}

export const OUTCOMES: readonly Outcome[] = [
  ...out(T.littleSteps, FW.lsMilestones, [
    [O.lsLang1, "EY.CL.1", "Listens to short stories.", S.lsStory, Y.lsSeedlings],
    [O.lsLang2, "EY.CL.2", "Retells familiar story events.", S.lsStory, Y.lsExplorer],
    [O.lsMotor1, "EY.PD.1", "Handles safe play tools steadily.", S.lsPlay, Y.lsSeedlings],
    [O.lsMotor2, "EY.PD.2", "Coordinates movement and rhythm.", S.lsRhythm, Y.lsExplorer],
    [O.lsSocial1, "EY.SE.1", "Takes turns and shares in play.", S.lsPlay, Y.lsSeedlings],
    [O.lsNature1, "EY.UW.1", "Observes plants and weather.", S.lsNature, Y.lsExplorer],
  ]),
  ...out(
    T.riverside,
    FW.rvStandards,
    [
      [O.rvMathDomain, "RV.MATH", "Number and algebra.", S.rvMaths, Y.rvYearFive],
      [O.rvMathFrac, "RV.MATH.5.1", "Adds fractions.", S.rvMaths, Y.rvYearFive, O.rvMathDomain],
      [O.rvMathAlg, "RV.MATH.9.1", "Linear equations.", S.rvMaths, Y.rvYearNine, O.rvMathDomain],
      [O.rvEngDomain, "RV.ENG", "Reading and writing.", S.rvEnglish, Y.rvYearFive],
      [O.rvEngRead, "RV.ENG.5.1", "Finds main ideas.", S.rvEnglish, Y.rvYearFive, O.rvEngDomain],
      [O.rvEngWrite, "RV.ENG.9.1", "Builds arguments.", S.rvEnglish, Y.rvYearNine, O.rvEngDomain],
    ],
    true,
  ),
  ...out(T.northbridge, FW.nbCourseOutcomes, [
    [O.nbCo1, "CO1", "Designs modular structured programs.", S.nbProgramming, Y.nbFirstYear],
    [O.nbCo2, "CO2", "Applies unit tests and debugging.", S.nbProgramming, Y.nbFirstYear],
    [O.nbCo3, "CO3", "Models schemas and normalised SQL.", S.nbDatabases, Y.nbSecondYear],
  ]),
  ...out(T.northbridge, FW.nbProgramOutcomes, [
    [O.nbPo1, "PO1", "Analyses computing engineering tasks.", S.nbProgramming, Y.nbFirstYear],
    [O.nbPo2, "PO2", "Builds and tests reliable software.", S.nbSystems, Y.nbSecondYear],
    [O.nbPo3, "PO3", "Evaluates data models and trade-offs.", S.nbDatabases, Y.nbSecondYear],
  ]),
  ...out(T.apex, FW.axSyllabus, [
    [O.axAlgQuad, "AX.ALG.1", "Solves quadratics on time.", S.axAlgebra, Y.axFoundation],
    [O.axMechKin, "AX.MECH.1", "Applies kinematics formulas.", S.axMechanics, Y.axFoundation],
    [O.axCalcDer, "AX.CALC.1", "Differentiates composite tasks.", S.axCalculus, Y.axAdvanced],
  ]),
  ...out(T.harmony, FW.hmSkills, [
    [O.hmGrade1, "GR1.TECH", "Grade 1: Plays steady scales.", S.hmPiano, Y.hmBeginner],
    [O.hmGrade2, "GR2.EAR", "Grade 2: Recognises intervals.", S.hmEarTraining, Y.hmBeginner],
    [O.hmGrade3, "GR3.THEO", "Grade 3: Reads key signatures.", S.hmTheory, Y.hmIntermediate],
  ]),
];

export const OUTCOME_MAPPINGS: readonly OutcomeMapping[] = (
  [
    [OM.nbCo1Po1, O.nbCo1, O.nbPo1, 3],
    [OM.nbCo1Po2, O.nbCo1, O.nbPo2, 2],
    [OM.nbCo2Po2, O.nbCo2, O.nbPo2, 3],
    [OM.nbCo3Po3, O.nbCo3, O.nbPo3, 3],
    [OM.nbCo3Po1, O.nbCo3, O.nbPo1, 1],
  ] as const
).map(([id, fromOutcomeId, toOutcomeId, strength]) => ({
  id,
  tenantId: T.northbridge,
  fromOutcomeId,
  toOutcomeId,
  strength,
  createdAt: CREATED_AT,
}));

function rvUnit(
  id: string,
  subjectId: string,
  yearLevelId: string,
  code: string,
  title: string,
  order: number,
  plannedHours: number,
  outcomeId: string,
  topics: readonly (readonly [string, string])[],
): SyllabusUnit {
  return {
    id,
    tenantId: T.riverside,
    subjectId,
    yearLevelId,
    code,
    title,
    order,
    plannedHours,
    outcomeIds: [outcomeId],
    topics: topics.map(([tId, tTitle], i) => ({
      id: tId,
      title: tTitle,
      order: i + 1,
      outcomeIds: [outcomeId],
    })),
    ...ts,
  };
}

export const SYLLABUS_UNITS: readonly SyllabusUnit[] = [
  rvUnit(SU.rvMathY5, S.rvMaths, Y.rvYearFive, "MATH-Y5-U1", "Fractions", 1, 10, O.rvMathFrac, [
    [ST.rvMath1, "Equivalent fractions on a fraction wall"],
    [ST.rvMath2, "Adding fractions with related denominators"],
  ]),
  rvUnit(SU.rvMathY9, S.rvMaths, Y.rvYearNine, "MATH-Y9-U1", "Graphs", 2, 12.5, O.rvMathAlg, [
    [ST.rvMath3, "Solving two-step linear equations"],
    [ST.rvMath4, "Interpreting gradients and intercepts"],
  ]),
  rvUnit(SU.rvEngY5, S.rvEnglish, Y.rvYearFive, "ENG-Y5-U1", "Non-Fiction", 1, 8, O.rvEngRead, [
    [ST.rvEng1, "Locating main ideas and headings"],
    [ST.rvEng2, "Summarising supporting facts"],
  ]),
  rvUnit(SU.rvEngY9, S.rvEnglish, Y.rvYearNine, "ENG-Y9-U1", "Arguments", 2, 12, O.rvEngWrite, [
    [ST.rvEng3, "Drafting a focused thesis statement"],
    [ST.rvEng4, "Integrating textual evidence"],
  ]),
];

interface PlanOpts {
  source?: LessonPlanSource;
  reviewedAt?: string;
  reviewNote?: string;
}

function rvPlan(
  id: string,
  offeringId: string,
  date: string,
  title: string,
  topicId: string,
  status: LessonPlanStatus,
  opts?: PlanOpts,
): LessonPlan {
  const offering = SUBJECT_OFFERINGS.find((r) => r.id === offeringId);
  const teacherId = offering?.staffProfileIds[0];
  const topic = SYLLABUS_UNITS.flatMap((u) => u.topics).find((t) => t.id === topicId);
  if (!offering || !teacherId || !topic) throw new Error(`Incomplete lesson plan ${id}`);
  return {
    id,
    tenantId: T.riverside,
    subjectOfferingId: offeringId,
    staffProfileId: teacherId,
    date,
    timetableSlotId: null,
    title,
    topicIds: [topicId],
    outcomeIds: [...topic.outcomeIds],
    objectives: `Learners practise and apply: ${title}.`,
    activities: [
      { order: 1, title: "Warm-up recap", minutes: 10, kind: "intro" },
      { order: 2, title: "Guided walkthrough", minutes: 20, kind: "instruction" },
      { order: 3, title: "Independent practice", minutes: 15, kind: "practice" },
    ],
    resources: "Class handouts and worked examples.",
    source: opts?.source ?? "manual",
    status,
    reviewedByStaffProfileId: opts?.reviewedAt ? rvHelen : null,
    reviewedAt: opts?.reviewedAt ?? null,
    reviewNote: opts?.reviewNote ?? null,
    ...ts,
  };
}

const S5 = OFF.rvSouthYearFive;
const N9 = OFF.rvNorthYearNine;

export const LESSON_PLANS: readonly LessonPlan[] = [
  rvPlan(LP.rvDelivered, S5[1], "2026-09-14", "Equivalent Fractions", ST.rvMath1, "delivered", {
    reviewedAt: "2026-09-11T09:30:00Z",
    reviewNote: "Approved for autumn term.",
  }),
  rvPlan(LP.rvApproved, S5[1], "2026-09-16", "Adding Fractions", ST.rvMath2, "approved", {
    reviewedAt: "2026-09-12T10:00:00Z",
    reviewNote: "Clear worked examples.",
  }),
  rvPlan(LP.rvSubmitted, S5[0], "2026-09-18", "Main Ideas", ST.rvEng1, "submitted"),
  rvPlan(LP.rvReturned, N9[0], "2026-09-21", "Evidence Paragraphs", ST.rvEng4, "returned", {
    reviewedAt: "2026-09-13T11:00:00Z",
    reviewNote: "Add a brief formative check.",
  }),
  rvPlan(LP.rvAiDraft, N9[1], "2026-09-23", "Gradients", ST.rvMath4, "draft", {
    source: "ai_draft",
  }),
];

type CovRow = readonly [string, string, string, CoverageStatus, string | null, string | null];

export const COVERAGE_ENTRIES: readonly CoverageEntry[] = (
  [
    [COV.rvMath1, S5[1], ST.rvMath1, "covered", "2026-09-14", LP.rvDelivered],
    [COV.rvMath2, S5[1], ST.rvMath2, "in_progress", null, LP.rvApproved],
    [COV.rvEng3, N9[0], ST.rvEng3, "covered", "2026-09-18", null],
    [COV.rvEng4, N9[0], ST.rvEng4, "not_started", null, LP.rvReturned],
  ] as readonly CovRow[]
).map(([id, subjectOfferingId, topicId, status, coveredOn, lessonPlanId]) => ({
  id,
  tenantId: T.riverside,
  subjectOfferingId,
  topicId,
  status,
  coveredOn,
  lessonPlanId,
  updatedAt: UPDATED_AT,
}));
