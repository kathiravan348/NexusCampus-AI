import type {
  Doubt,
  DoubtAnswer,
  ParentReport,
  SectionScore,
  TestRank,
  TestSeries,
  WeakTopicPlan,
} from "@nexus/contracts";
import { INSTITUTION, PERSON, TENANT } from "./ids";
import { CLASS_GROUP, LEARNER, SUBJECT } from "./ids-stage3";
import { ONLINE_TEST, QUESTION_ITEM, TEST_SECTION } from "./ids-stage4-assess";
import { COURSE_SPACE, OUTCOME } from "./ids-stage4-learning";
import {
  DOUBT,
  DOUBT_ANSWER,
  DOUBT_CLIENT,
  PARENT_REPORT,
  TEST_SERIES,
  WEAK_TOPIC_PLAN,
} from "./ids-stage4-more";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const tenantId = TENANT.apex;
const teacher = ROLE_PROFILES.find(
  (row) => row.tenantId === tenantId && row.personId === PERSON.axMeena && row.kind === "staff",
);
if (!teacher) throw new Error("Missing Apex test-prep teacher");
const staff = teacher.id;

const seriesDefaults = {
  tenantId,
  institutionId: INSTITUTION.apex,
  targetExam: "Engineering entrance practice",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const TEST_SERIES_ROWS: readonly TestSeries[] = [
  {
    ...seriesDefaults,
    id: TEST_SERIES.axDraft,
    code: "AX-NEXT",
    name: "Next Diagnostic Series",
    classGroupIds: [CLASS_GROUP.axAdvanced],
    testIds: [ONLINE_TEST.axAdaptive],
    status: "draft",
  },
  {
    ...seriesDefaults,
    id: TEST_SERIES.axActive,
    code: "AX-PRACTICE",
    name: "Engineering Entrance Practice",
    classGroupIds: [CLASS_GROUP.axFoundation, CLASS_GROUP.axAdvanced],
    testIds: [ONLINE_TEST.axMock, ONLINE_TEST.axAdaptive],
    status: "active",
  },
  {
    ...seriesDefaults,
    id: TEST_SERIES.axCompleted,
    code: "AX-FIRST-MOCK",
    name: "September Timed Mock",
    classGroupIds: [CLASS_GROUP.axFoundation],
    testIds: [ONLINE_TEST.axMock],
    status: "completed",
  },
];

const sectionScores = (algebra: number, mechanics: number): SectionScore[] => [
  { sectionId: TEST_SECTION.axMockAlg, scorePoints: algebra, maxPoints: 8 },
  { sectionId: TEST_SECTION.axMockPool, scorePoints: mechanics, maxPoints: 4 },
];
const rankDefaults = {
  tenantId,
  seriesId: TEST_SERIES.axCompleted,
  testId: ONLINE_TEST.axMock,
  maxPoints: 12,
  participants: 2,
  publishedAt: "2026-10-01T08:00:00Z",
};

// Rank rows use learner IDs for private joins. The contract carries no display name.
export const TEST_RANKS: readonly TestRank[] = [
  {
    ...rankDefaults,
    learnerId: LEARNER.axVijay,
    scorePoints: 3,
    rank: 1,
    percentileBps: 10000,
    sectionScores: sectionScores(3, 0),
  },
  {
    ...rankDefaults,
    learnerId: LEARNER.axDivya,
    scorePoints: -2,
    rank: 2,
    percentileBps: 5000,
    sectionScores: sectionScores(-1, -1),
  },
];

const doubtDefaults = { tenantId, attachmentCount: 0, deviceId: null, createdAt: CREATED_AT };
export const DOUBTS: readonly Doubt[] = [
  {
    ...doubtDefaults,
    id: DOUBT.axOpen,
    learnerId: LEARNER.axVijay,
    courseSpaceId: COURSE_SPACE.axAlgebra,
    questionItemId: QUESTION_ITEM.axQuadMcq,
    subjectId: SUBJECT.axAlgebra,
    text: "When does a quadratic have a repeated root?",
    status: "open",
    clientId: DOUBT_CLIENT.axOpen,
  },
  {
    ...doubtDefaults,
    id: DOUBT.axAiAnswered,
    learnerId: LEARNER.axArun,
    courseSpaceId: null,
    questionItemId: QUESTION_ITEM.axQuadMcq,
    subjectId: SUBJECT.axAlgebra,
    text: "Which coefficients belong in the discriminant?",
    status: "ai_answered",
    clientId: DOUBT_CLIENT.axAiAnswered,
  },
  {
    ...doubtDefaults,
    id: DOUBT.axAnswered,
    learnerId: LEARNER.axDivya,
    courseSpaceId: COURSE_SPACE.axAlgebra,
    questionItemId: QUESTION_ITEM.axQuadNumeric,
    subjectId: SUBJECT.axAlgebra,
    text: "Can I find the sum of the roots before factoring?",
    status: "answered",
    clientId: DOUBT_CLIENT.axAnswered,
  },
  {
    ...doubtDefaults,
    id: DOUBT.axClosed,
    learnerId: LEARNER.axVijay,
    courseSpaceId: COURSE_SPACE.axAlgebra,
    questionItemId: null,
    subjectId: SUBJECT.axAlgebra,
    text: "Does dividing both sides by two change the roots?",
    status: "closed",
    clientId: DOUBT_CLIENT.axClosed,
  },
];

const staffAnswer = {
  tenantId,
  kind: "staff",
  aiGenerated: false,
  tier: null,
  sources: [],
  answeredByStaffProfileId: staff,
  verifiedByStaffProfileId: null,
  createdAt: CREATED_AT,
} satisfies Partial<DoubtAnswer>;

export const DOUBT_ANSWERS: readonly DoubtAnswer[] = [
  {
    id: DOUBT_ANSWER.axAi,
    tenantId,
    doubtId: DOUBT.axAiAnswered,
    kind: "ai",
    text: "Read the coefficients from ax² + bx + c = 0, then substitute them into b² − 4ac.",
    aiGenerated: true,
    tier: "balanced",
    sources: [
      {
        moduleId: "M33",
        recordType: "questionItem",
        recordId: QUESTION_ITEM.axQuadMcq,
        label: "Batch practice: quadratic discriminants",
      },
    ],
    answeredByStaffProfileId: null,
    verifiedByStaffProfileId: staff,
    createdAt: CREATED_AT,
  },
  {
    ...staffAnswer,
    id: DOUBT_ANSWER.axStaff,
    doubtId: DOUBT.axAnswered,
    text: "Use −b/a once the equation is written in standard form.",
  },
  {
    ...staffAnswer,
    id: DOUBT_ANSWER.axClosed,
    doubtId: DOUBT.axClosed,
    text: "Dividing both sides by a nonzero number preserves the solutions.",
  },
];

const planDefaults = {
  tenantId,
  seriesId: TEST_SERIES.axActive,
  aiGenerated: true,
  tier: "balanced",
  createdAt: CREATED_AT,
} as const;

export const WEAK_TOPIC_PLANS: readonly WeakTopicPlan[] = [
  {
    ...planDefaults,
    id: WEAK_TOPIC_PLAN.axDraft,
    learnerId: LEARNER.axNila,
    topics: [
      {
        outcomeId: OUTCOME.axMechKin,
        reason: "Practise identifying the known quantities before choosing an equation.",
        suggestedItemCount: 4,
      },
    ],
    status: "draft",
    sharedByStaffProfileId: null,
    sharedAt: null,
  },
  {
    ...planDefaults,
    id: WEAK_TOPIC_PLAN.axShared,
    learnerId: LEARNER.axArun,
    topics: [
      {
        outcomeId: OUTCOME.axAlgQuad,
        reason: "Review the signs of the coefficients when computing the discriminant.",
        suggestedItemCount: 5,
      },
    ],
    status: "shared",
    sharedByStaffProfileId: staff,
    sharedAt: "2026-10-22T08:00:00Z",
  },
];

const reportDefaults = {
  tenantId,
  seriesId: TEST_SERIES.axCompleted,
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  testsTaken: 1,
  attendanceBps: null,
};

export const PARENT_REPORTS: readonly ParentReport[] = [
  {
    ...reportDefaults,
    id: PARENT_REPORT.axDraft,
    learnerId: LEARNER.axDivya,
    averagePercentileBps: 5000,
    teacherComment: null,
    status: "draft",
    sentByStaffProfileId: null,
    sentAt: null,
  },
  {
    ...reportDefaults,
    id: PARENT_REPORT.axSent,
    learnerId: LEARNER.axVijay,
    averagePercentileBps: 10000,
    teacherComment: "Review how to choose a motion equation from the quantities provided.",
    status: "sent",
    sentByStaffProfileId: staff,
    sentAt: "2026-10-02T08:00:00Z",
  },
];
