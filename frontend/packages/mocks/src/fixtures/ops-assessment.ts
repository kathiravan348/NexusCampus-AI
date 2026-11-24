import type {
  Assessment,
  GradeBand,
  GradingScheme,
  GradingSchemeKind,
  MarkEntry,
  Rubric,
} from "@nexus/contracts";
import { SUBJECT_OFFERINGS } from "./academics";
import { INSTITUTION, TENANT } from "./ids";
import {
  ASSESSMENT,
  CLASS_GROUP,
  GRADING_SCHEME,
  markEntryId,
  type OpsTenantSlug,
  RUBRIC,
} from "./ids-stage3";
import { ENROLMENTS } from "./learner-records";
import { CREATED_AT, UPDATED_AT } from "./tenants";

export * from "./ops-assessment-2";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

interface SchemeSpec {
  readonly slug: OpsTenantSlug;
  readonly tenantId: string;
  readonly institutionId: string;
  readonly primaryGroupId: string;
  readonly secondaryGroupId: string;
  readonly schemeKind: GradingSchemeKind;
  readonly schemeName: string;
  readonly bands: readonly GradeBand[];
}

const SPECS: readonly SchemeSpec[] = [
  {
    slug: "ls",
    tenantId: TENANT.littleSteps,
    institutionId: INSTITUTION.littleSteps,
    primaryGroupId: CLASS_GROUP.lsSeedlings,
    secondaryGroupId: CLASS_GROUP.lsExplorer,
    schemeKind: "descriptor",
    schemeName: "Early Years Growth Descriptors",
    bands: [
      { code: "EM", label: "Emerging", minPercent: 0, maxPercent: 50, gradePoint: null },
      { code: "DV", label: "Developing", minPercent: 50, maxPercent: 80, gradePoint: null },
      { code: "EX", label: "Excelling", minPercent: 80, maxPercent: 100, gradePoint: null },
    ],
  },
  {
    slug: "rv",
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
    primaryGroupId: CLASS_GROUP.rvSouthYearFive,
    secondaryGroupId: CLASS_GROUP.rvNorthYearTen,
    schemeKind: "letter",
    schemeName: "Secondary Letter Grades",
    bands: [
      { code: "D", label: "Developing", minPercent: 0, maxPercent: 50, gradePoint: null },
      { code: "C", label: "Satisfactory", minPercent: 50, maxPercent: 70, gradePoint: null },
      { code: "B", label: "Good", minPercent: 70, maxPercent: 85, gradePoint: null },
      { code: "A", label: "Excellent", minPercent: 85, maxPercent: 100, gradePoint: null },
    ],
  },
  {
    slug: "nb",
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
    primaryGroupId: CLASS_GROUP.nbFirstYear,
    secondaryGroupId: CLASS_GROUP.nbSecondYear,
    schemeKind: "gpa",
    schemeName: "University 4.0 GPA Scale",
    bands: [
      { code: "F", label: "Fail", minPercent: 0, maxPercent: 50, gradePoint: 0 },
      { code: "C", label: "Pass", minPercent: 50, maxPercent: 70, gradePoint: 2 },
      { code: "B", label: "Merit", minPercent: 70, maxPercent: 85, gradePoint: 3 },
      { code: "A", label: "Distinction", minPercent: 85, maxPercent: 100, gradePoint: 4 },
    ],
  },
  {
    slug: "ax",
    tenantId: TENANT.apex,
    institutionId: INSTITUTION.apex,
    primaryGroupId: CLASS_GROUP.axFoundation,
    secondaryGroupId: CLASS_GROUP.axAdvanced,
    schemeKind: "percent",
    schemeName: "Test Prep Percent Bands",
    bands: [
      { code: "BELOW", label: "Needs Practice", minPercent: 0, maxPercent: 60, gradePoint: null },
      { code: "TARGET", label: "On Target", minPercent: 60, maxPercent: 85, gradePoint: null },
      { code: "TOP", label: "Top Band", minPercent: 85, maxPercent: 100, gradePoint: null },
    ],
  },
  {
    slug: "hm",
    tenantId: TENANT.harmony,
    institutionId: INSTITUTION.harmony,
    primaryGroupId: CLASS_GROUP.hmBeginner,
    secondaryGroupId: CLASS_GROUP.hmIntermediate,
    schemeKind: "competency",
    schemeName: "Music Competency Levels",
    bands: [
      { code: "BEG", label: "Beginning", minPercent: 0, maxPercent: 50, gradePoint: null },
      { code: "PRF", label: "Proficient", minPercent: 50, maxPercent: 80, gradePoint: null },
      { code: "MST", label: "Mastery", minPercent: 80, maxPercent: 100, gradePoint: null },
    ],
  },
];

const built = SPECS.map((spec) => {
  const { slug, tenantId, institutionId } = spec;
  const offOne = SUBJECT_OFFERINGS.find((o) => o.classGroupId === spec.primaryGroupId);
  const secOff = SUBJECT_OFFERINGS.find((o) => o.classGroupId === spec.secondaryGroupId);
  const offOneStaff = offOne?.staffProfileIds[0];
  const secOffStaff = secOff?.staffProfileIds[0];
  if (!offOne || !secOff || !offOneStaff || !secOffStaff) {
    throw new Error(`Incomplete grading references for ${tenantId}`);
  }
  const learnersIn = (groupId: string) =>
    ENROLMENTS.filter((e) => e.classGroupId === groupId).map((e) => e.learnerId);
  const primaryLearners = learnersIn(spec.primaryGroupId);
  const secondaryLearners = learnersIn(spec.secondaryGroupId);

  const scheme: GradingScheme = {
    id: GRADING_SCHEME[slug],
    tenantId,
    institutionId,
    name: spec.schemeName,
    kind: spec.schemeKind,
    bands: [...spec.bands],
    ...timestamps,
  };

  const rubric: Rubric = {
    id: RUBRIC[slug],
    tenantId,
    name: "Core Mastery Rubric",
    criteria: [
      {
        code: "UNDERSTANDING",
        label: "Concept understanding",
        levels: [
          { score: 1, descriptor: "Beginning grasp of core concepts." },
          { score: 2, descriptor: "Solid understanding with guidance." },
          { score: 3, descriptor: "Independent and accurate mastery." },
        ],
      },
      {
        code: "EXECUTION",
        label: "Application and clarity",
        levels: [
          { score: 1, descriptor: "Applies steps with frequent prompts." },
          { score: 2, descriptor: "Completes work clearly and reliably." },
          { score: 3, descriptor: "Consistent precision in varied tasks." },
        ],
      },
    ],
  };

  const [asmOneId, asmTwoId] = ASSESSMENT[slug];
  const assessments: Assessment[] = [
    {
      id: asmOneId,
      tenantId,
      subjectOfferingId: offOne.id,
      name: "Mid-Term Evaluation",
      kind: spec.schemeKind === "descriptor" ? "observation" : "test",
      maxMarks: 100,
      weightPercent: 50,
      rubricId: rubric.id,
      dueOn: "2026-10-15",
      status: "published",
      ...timestamps,
    },
    {
      id: asmTwoId,
      tenantId,
      subjectOfferingId: secOff.id,
      name: "Unit Practice Assignment",
      kind: "assignment",
      maxMarks: 50,
      weightPercent: 50,
      rubricId: null,
      dueOn: "2026-11-12",
      status: "marking",
      ...timestamps,
    },
  ];

  const markEntries: MarkEntry[] = [
    ...primaryLearners.map((learnerId, idx) => ({
      id: markEntryId(asmOneId, learnerId),
      tenantId,
      assessmentId: asmOneId,
      learnerId,
      marks: idx === 0 ? 88 : 78,
      absent: false,
      rubricScores: { UNDERSTANDING: 3, EXECUTION: idx === 0 ? 3 : 2 },
      remark: "Steady progress across unit tasks.",
      enteredByStaffProfileId: offOneStaff,
      enteredAt: "2026-10-18T11:00:00Z",
      deviceId: null,
    })),
    ...secondaryLearners.map((learnerId, idx) => ({
      id: markEntryId(asmTwoId, learnerId),
      tenantId,
      assessmentId: asmTwoId,
      learnerId,
      marks: idx === 0 ? null : 42,
      absent: idx === 0,
      rubricScores: null,
      remark: idx === 0 ? "Absent on assessment date." : null,
      enteredByStaffProfileId: secOffStaff,
      enteredAt: "2026-11-13T11:00:00Z",
      deviceId: null,
    })),
  ];

  return { scheme, rubric, assessments, markEntries };
});

export const GRADING_SCHEMES: readonly GradingScheme[] = built.map((b) => b.scheme);
export const RUBRICS: readonly Rubric[] = built.map((b) => b.rubric);
export const ASSESSMENTS: readonly Assessment[] = built.flatMap((b) => b.assessments);
export const MARK_ENTRIES: readonly MarkEntry[] = built.flatMap((b) => b.markEntries);
