import { describe, expect, it } from "vitest";
import {
  DoubtAnswerSchema,
  DoubtSchema,
  ParentReportSchema,
  TestRankSchema,
  TestSeriesSchema,
  WeakTopicPlanSchema,
  type Doubt,
  type DoubtAnswer,
  type DoubtStatus,
  type ParentReport,
  type TestRank,
  type TestSeries,
  type WeakTopicPlan,
} from "./index";

const series: TestSeries = {
  id: "series-jee-2027",
  tenantId: "tenant-coaching",
  institutionId: "institution-coaching",
  code: "JEE-27-MOCK",
  name: "JEE Main 2027 mock series",
  targetExam: "JEE Main 2027",
  classGroupIds: ["batch-jee-a", "batch-jee-b"],
  testIds: ["test-jee-mock-1", "test-jee-mock-2"],
  status: "active",
  createdAt: "2026-06-01T08:00:00Z",
  updatedAt: "2026-06-01T08:00:00Z",
};
const rank: TestRank = {
  tenantId: "tenant-coaching",
  seriesId: series.id,
  testId: "test-jee-mock-1",
  learnerId: "learner-priya",
  scorePoints: 212,
  maxPoints: 300,
  participants: 480,
  rank: 37,
  percentileBps: 9250,
  sectionScores: [
    { sectionId: "physics", scorePoints: 72, maxPoints: 100 },
    { sectionId: "chemistry", scorePoints: 80, maxPoints: 100 },
    { sectionId: "maths", scorePoints: 60, maxPoints: 100 },
  ],
  publishedAt: "2026-07-21T12:00:00Z",
};
const doubt: Doubt = {
  id: "doubt-1",
  tenantId: "tenant-coaching",
  learnerId: "learner-priya",
  courseSpaceId: null,
  questionItemId: "item-p1",
  subjectId: "subject-physics",
  text: "Why is the normal force not equal to mg on the incline?",
  attachmentCount: 1,
  status: "ai_answered",
  clientId: "2c1b0a9f-8e7d-4c6b-a5f4-e3d2c1b0a9f8",
  deviceId: null,
  createdAt: "2026-07-22T15:00:00Z",
};
const aiAnswer: DoubtAnswer = {
  id: "doubt-answer-1",
  tenantId: "tenant-coaching",
  doubtId: doubt.id,
  kind: "ai",
  text: "On an incline only the perpendicular component of weight, mg cos θ, presses into the surface.",
  aiGenerated: true,
  tier: "balanced",
  sources: [
    {
      moduleId: "M31",
      recordType: "contentItem",
      recordId: "content-inclines",
      label: "Inclined planes",
    },
  ],
  answeredByStaffProfileId: null,
  verifiedByStaffProfileId: null,
  createdAt: "2026-07-22T15:00:10Z",
};
const staffAnswer: DoubtAnswer = {
  ...aiAnswer,
  id: "doubt-answer-2",
  kind: "staff",
  aiGenerated: false,
  tier: null,
  sources: [],
  answeredByStaffProfileId: "staff-physics",
};
const plan: WeakTopicPlan = {
  id: "plan-priya-1",
  tenantId: "tenant-coaching",
  learnerId: "learner-priya",
  seriesId: series.id,
  aiGenerated: true,
  tier: "balanced",
  topics: [
    {
      outcomeId: "outcome-rotational",
      reason: "4 of 5 rotation questions wrong in mocks 1–2.",
      suggestedItemCount: 20,
    },
  ],
  status: "shared",
  sharedByStaffProfileId: "staff-physics",
  sharedAt: "2026-07-23T09:00:00Z",
  createdAt: "2026-07-22T20:00:00Z",
};
const report: ParentReport = {
  id: "report-priya-july",
  tenantId: "tenant-coaching",
  learnerId: "learner-priya",
  seriesId: series.id,
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  testsTaken: 2,
  averagePercentileBps: 9100,
  attendanceBps: 9600,
  teacherComment: "Steady progress; practise rotation daily.",
  status: "sent",
  sentByStaffProfileId: "staff-physics",
  sentAt: "2026-08-01T10:00:00Z",
};

describe("series and ranks", () => {
  it("accepts a JEE series and a rank with section scores", () => {
    expect(TestSeriesSchema.safeParse(series).success).toBe(true);
    expect(TestRankSchema.safeParse(rank).success).toBe(true);
  });

  it("rejects an empty series and bad ranks", () => {
    expect(TestSeriesSchema.safeParse({ ...series, testIds: [] }).success).toBe(false);
    expect(TestRankSchema.safeParse({ ...rank, rank: 481 }).success).toBe(false);
    const overSection = [{ sectionId: "physics", scorePoints: 101, maxPoints: 100 }];
    expect(TestRankSchema.safeParse({ ...rank, sectionScores: overSection }).success).toBe(false);
    const duplicate = [rank.sectionScores[0], rank.sectionScores[0]];
    expect(TestRankSchema.safeParse({ ...rank, sectionScores: duplicate }).success).toBe(false);
    expect(TestRankSchema.safeParse({ ...rank, scorePoints: 300.5 }).success).toBe(false);
  });
});

describe("doubts and answers", () => {
  it("accepts each doubt status, an AI answer (then verified) and a staff answer", () => {
    const statuses: DoubtStatus[] = ["open", "ai_answered", "answered", "closed"];
    for (const status of statuses) {
      expect(DoubtSchema.safeParse({ ...doubt, status }).success).toBe(true);
    }
    expect(DoubtAnswerSchema.safeParse(aiAnswer).success).toBe(true);
    expect(
      DoubtAnswerSchema.safeParse({ ...aiAnswer, verifiedByStaffProfileId: "staff-physics" })
        .success,
    ).toBe(true);
    expect(DoubtAnswerSchema.safeParse(staffAnswer).success).toBe(true);
  });

  it("rejects unlabelled, uncited or mixed answers and 6 attachments", () => {
    expect(DoubtSchema.safeParse({ ...doubt, attachmentCount: 6 }).success).toBe(false);
    expect(DoubtAnswerSchema.safeParse({ ...aiAnswer, sources: [] }).success).toBe(false);
    expect(DoubtAnswerSchema.safeParse({ ...aiAnswer, tier: null }).success).toBe(false);
    expect(DoubtAnswerSchema.safeParse({ ...staffAnswer, aiGenerated: true }).success).toBe(false);
    expect(
      DoubtAnswerSchema.safeParse({ ...staffAnswer, verifiedByStaffProfileId: "staff-head" })
        .success,
    ).toBe(false);
    expect(
      DoubtAnswerSchema.safeParse({ ...aiAnswer, answeredByStaffProfileId: "staff-physics" })
        .success,
    ).toBe(false);
  });
});

describe("plans and reports", () => {
  it("accepts a draft and a shared plan and a draft and a sent report", () => {
    expect(WeakTopicPlanSchema.safeParse(plan).success).toBe(true);
    expect(
      WeakTopicPlanSchema.safeParse({
        ...plan,
        status: "draft",
        sharedByStaffProfileId: null,
        sharedAt: null,
      }).success,
    ).toBe(true);
    expect(ParentReportSchema.safeParse(report).success).toBe(true);
    expect(
      ParentReportSchema.safeParse({
        ...report,
        status: "draft",
        sentByStaffProfileId: null,
        sentAt: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a shared plan without a person and a backwards period", () => {
    expect(WeakTopicPlanSchema.safeParse({ ...plan, sharedByStaffProfileId: null }).success).toBe(
      false,
    );
    expect(
      WeakTopicPlanSchema.safeParse({ ...plan, topics: [plan.topics[0], plan.topics[0]] }).success,
    ).toBe(false);
    expect(ParentReportSchema.safeParse({ ...report, periodEnd: "2026-06-30" }).success).toBe(
      false,
    );
    expect(ParentReportSchema.safeParse({ ...report, sentAt: null }).success).toBe(false);
  });
});
