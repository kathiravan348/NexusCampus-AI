import { describe, expect, it } from "vitest";
import {
  ItemStatisticSchema,
  OnlineTestSchema,
  TestAttemptSchema,
  TestResponseSchema,
  type ItemStatistic,
  type OnlineTest,
  type TestAttempt,
  type TestAttemptStatus,
  type TestResponse,
} from "./index";

const timestamps = { createdAt: "2026-06-01T08:00:00Z", updatedAt: "2026-06-02T08:00:00Z" };

const practice: OnlineTest = {
  ...timestamps,
  id: "test-fractions-practice",
  tenantId: "tenant-school",
  courseSpaceId: "space-5a-maths",
  assessmentId: null,
  title: "Fractions practice",
  mode: "practice",
  sections: [
    { id: "section-1", title: "Warm-up", itemIds: ["item-half", "item-order"], pool: null },
  ],
  timeLimitMinutes: null,
  opensAt: "2026-07-01T03:00:00Z",
  closesAt: "2026-07-31T18:00:00Z",
  attemptsAllowed: null,
  shuffleOptions: true,
  showResults: "immediately",
  passMarkBps: null,
  proctored: false,
  status: "open",
};
const mock: OnlineTest = {
  ...practice,
  id: "test-jee-mock-4",
  tenantId: "tenant-coaching",
  courseSpaceId: null,
  assessmentId: null,
  title: "JEE mock test 4",
  mode: "graded",
  sections: [
    { id: "physics", title: "Physics", itemIds: ["item-p1", "item-p2"], pool: null },
    { id: "chemistry", title: "Chemistry", itemIds: ["item-c1"], pool: null },
  ],
  timeLimitMinutes: 180,
  attemptsAllowed: 1,
  showResults: "after_close",
  proctored: true,
  status: "scheduled",
};
const adaptive: OnlineTest = {
  ...mock,
  id: "test-cs101-adaptive",
  tenantId: "tenant-university",
  courseSpaceId: "space-cs101",
  assessmentId: "assessment-cs101-quiz",
  title: "Adaptive check",
  mode: "adaptive",
  sections: [
    {
      id: "pool-1",
      title: "Core",
      itemIds: [],
      pool: { bankIds: ["bank-cs101"], outcomeIds: ["outcome-co3"], itemCount: 15 },
    },
  ],
  attemptsAllowed: 2,
  passMarkBps: 6000,
  proctored: false,
};
const attempt: TestAttempt = {
  id: "attempt-aarav-1",
  tenantId: "tenant-school",
  testId: practice.id,
  learnerId: "learner-aarav",
  attemptNumber: 1,
  status: "released",
  startedAt: "2026-07-02T09:00:00Z",
  submittedAt: "2026-07-02T09:12:00Z",
  scorePoints: 7.5,
  maxPoints: 10,
  clientId: "9b2f4e1a-6c3d-4f8e-a1b2-c3d4e5f60718",
  deviceId: "device-tablet-7",
};
const response: TestResponse = {
  id: "response-1",
  tenantId: "tenant-school",
  attemptId: attempt.id,
  itemId: "item-half",
  selectedOptionIds: ["a"],
  textAnswer: null,
  numericAnswer: null,
  autoScore: 1,
  manualScore: null,
  markedByStaffProfileId: null,
  flagged: false,
  answeredAt: "2026-07-02T09:03:00Z",
};
const statistic: ItemStatistic = {
  tenantId: "tenant-school",
  itemId: "item-half",
  testId: null,
  responses: 120,
  facilityBps: 7250,
  discrimination: 0.41,
  optionCounts: { a: 87, b: 20, c: 13 },
  computedAt: "2026-08-01T00:00:00Z",
};

describe("online tests", () => {
  it("accepts a K12 practice test, a TP graded mock and an HE adaptive test", () => {
    for (const test of [practice, mock, adaptive]) {
      expect(OnlineTestSchema.safeParse(test).success).toBe(true);
    }
  });

  it("rejects bad sections and settings", () => {
    const both = {
      id: "s",
      title: "Both",
      itemIds: ["item-1"],
      pool: adaptive.sections[0]?.pool ?? null,
    };
    expect(OnlineTestSchema.safeParse({ ...practice, sections: [both] }).success).toBe(false);
    const neither = { id: "s", title: "Empty", itemIds: [], pool: null };
    expect(OnlineTestSchema.safeParse({ ...practice, sections: [neither] }).success).toBe(false);
    expect(OnlineTestSchema.safeParse({ ...adaptive, sections: mock.sections }).success).toBe(
      false,
    );
    expect(OnlineTestSchema.safeParse({ ...mock, attemptsAllowed: null }).success).toBe(false);
    expect(OnlineTestSchema.safeParse({ ...practice, proctored: true }).success).toBe(false);
    expect(OnlineTestSchema.safeParse({ ...practice, closesAt: practice.opensAt }).success).toBe(
      false,
    );
    const duplicateSections = [mock.sections[0], mock.sections[0]];
    expect(OnlineTestSchema.safeParse({ ...mock, sections: duplicateSections }).success).toBe(
      false,
    );
    expect(OnlineTestSchema.safeParse({ ...mock, timeLimitMinutes: 601 }).success).toBe(false);
    expect(OnlineTestSchema.safeParse({ ...practice, sections: [] }).success).toBe(false);
  });
});

describe("attempts", () => {
  it("accepts an attempt in each status", () => {
    const byStatus: Record<TestAttemptStatus, TestAttempt> = {
      in_progress: { ...attempt, status: "in_progress", submittedAt: null, scorePoints: null },
      submitted: { ...attempt, status: "submitted", scorePoints: null },
      auto_submitted: { ...attempt, status: "auto_submitted", scorePoints: 6 },
      marked: { ...attempt, status: "marked" },
      released: attempt,
    };
    for (const value of Object.values(byStatus)) {
      expect(TestAttemptSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects bad attempts", () => {
    expect(TestAttemptSchema.safeParse({ ...attempt, scorePoints: 10.5 }).success).toBe(false);
    expect(TestAttemptSchema.safeParse({ ...attempt, scorePoints: null }).success).toBe(false);
    expect(TestAttemptSchema.safeParse({ ...attempt, submittedAt: null }).success).toBe(false);
    const inProgressScored = { ...attempt, status: "in_progress", submittedAt: null };
    expect(TestAttemptSchema.safeParse(inProgressScored).success).toBe(false);
    expect(
      TestAttemptSchema.safeParse({ ...attempt, submittedAt: "2026-07-02T08:00:00Z" }).success,
    ).toBe(false);
    expect(TestAttemptSchema.safeParse({ ...attempt, clientId: "client-1" }).success).toBe(false);
  });
});

describe("responses and statistics", () => {
  it("accepts an auto-marked choice and a manually marked essay", () => {
    expect(TestResponseSchema.safeParse(response).success).toBe(true);
    const essay = {
      ...response,
      itemId: "item-essay",
      selectedOptionIds: [],
      textAnswer: "A fraction names equal parts of a whole…",
      autoScore: null,
      manualScore: 7.5,
      markedByStaffProfileId: "staff-maths",
      flagged: true,
    };
    expect(TestResponseSchema.safeParse(essay).success).toBe(true);
    expect(ItemStatisticSchema.safeParse(statistic).success).toBe(true);
  });

  it("rejects bad responses and statistics", () => {
    expect(TestResponseSchema.safeParse({ ...response, manualScore: 1 }).success).toBe(false);
    expect(
      TestResponseSchema.safeParse({ ...response, markedByStaffProfileId: "staff-maths" }).success,
    ).toBe(false);
    expect(TestResponseSchema.safeParse({ ...response, autoScore: 0.25 }).success).toBe(false);
    expect(
      TestResponseSchema.safeParse({ ...response, selectedOptionIds: ["a", "a"] }).success,
    ).toBe(false);
    expect(ItemStatisticSchema.safeParse({ ...statistic, discrimination: 1.2 }).success).toBe(
      false,
    );
    expect(ItemStatisticSchema.safeParse({ ...statistic, facilityBps: 10001 }).success).toBe(false);
    expect(ItemStatisticSchema.safeParse({ ...statistic, optionCounts: { a: -1 } }).success).toBe(
      false,
    );
  });
});
