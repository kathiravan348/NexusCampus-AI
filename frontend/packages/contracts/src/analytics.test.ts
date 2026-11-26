import { describe, expect, it } from "vitest";
import {
  EngagementSnapshotSchema,
  InterventionSchema,
  RiskScoreSchema,
  type EngagementSnapshot,
  type Intervention,
  type InterventionStatus,
  type RiskLevel,
  type RiskScore,
} from "./index";

const snapshot: EngagementSnapshot = {
  tenantId: "tenant-university",
  learnerId: "learner-ravi",
  courseSpaceId: "space-cs101",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-14",
  logins: 3,
  activeMinutes: 95,
  itemsCompleted: 4,
  submissionsOnTime: 1,
  submissionsLate: 1,
  submissionsMissing: 2,
  attendanceBps: 6200,
  averageScoreBps: 4800,
  computedAt: "2026-08-15T00:30:00Z",
};
const score: RiskScore = {
  id: "risk-ravi-1",
  tenantId: "tenant-university",
  learnerId: "learner-ravi",
  aiGenerated: true,
  tier: "balanced",
  modelVersion: "early-warning-2026.08",
  scoreBps: 7400,
  level: "high",
  factors: [
    {
      code: "missing_work",
      weightBps: 3500,
      detail: "2 of the last 4 assignments were not submitted.",
      sourceModule: "M32",
    },
    {
      code: "attendance_drop",
      weightBps: 2500,
      detail: "Attendance fell from 91% to 62% in two weeks.",
      sourceModule: "M17",
    },
    { code: "low_scores", weightBps: 1500, detail: "Average quiz score 48%.", sourceModule: "M33" },
  ],
  computedAt: "2026-08-15T01:00:00Z",
  status: "open",
  reviewedByStaffProfileId: null,
  reviewedAt: null,
  reviewNote: null,
};
const reviewed = { reviewedByStaffProfileId: "staff-advisor", reviewedAt: "2026-08-15T09:00:00Z" };
const intervention: Intervention = {
  id: "intervention-ravi-1",
  tenantId: "tenant-university",
  learnerId: "learner-ravi",
  riskScoreId: score.id,
  kind: "meeting",
  title: "Check-in with academic advisor",
  plan: "Meet this week; agree a catch-up plan for the two missing assignments.",
  ownerStaffProfileId: "staff-advisor",
  createdByStaffProfileId: "staff-advisor",
  status: "planned",
  startOn: "2026-08-16",
  reviewOn: "2026-08-30",
  outcome: null,
  createdAt: "2026-08-15T09:05:00Z",
  updatedAt: "2026-08-15T09:05:00Z",
};

describe("engagement snapshots", () => {
  it("accepts a course snapshot and an all-course snapshot", () => {
    expect(EngagementSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const all = { ...snapshot, courseSpaceId: null, attendanceBps: null, averageScoreBps: null };
    expect(EngagementSnapshotSchema.safeParse(all).success).toBe(true);
  });

  it("rejects bad periods and counts", () => {
    expect(
      EngagementSnapshotSchema.safeParse({ ...snapshot, periodEnd: "2026-07-31" }).success,
    ).toBe(false);
    expect(EngagementSnapshotSchema.safeParse({ ...snapshot, logins: -1 }).success).toBe(false);
    expect(EngagementSnapshotSchema.safeParse({ ...snapshot, attendanceBps: 10001 }).success).toBe(
      false,
    );
  });
});

describe("risk scores", () => {
  it("accepts each level and review status", () => {
    const levels: RiskLevel[] = ["low", "medium", "high"];
    for (const level of levels) {
      expect(RiskScoreSchema.safeParse({ ...score, level }).success).toBe(true);
    }
    expect(RiskScoreSchema.safeParse({ ...score, ...reviewed, status: "confirmed" }).success).toBe(
      true,
    );
    const dismissed = {
      ...score,
      ...reviewed,
      status: "dismissed",
      reviewNote: "Absent on approved medical leave.",
    };
    expect(RiskScoreSchema.safeParse(dismissed).success).toBe(true);
  });

  it("rejects bad factors", () => {
    const [first, second] = score.factors;
    expect(RiskScoreSchema.safeParse({ ...score, factors: [] }).success).toBe(false);
    const nine = Array.from({ length: 9 }, () => ({ ...first, weightBps: 100 }));
    expect(RiskScoreSchema.safeParse({ ...score, factors: nine }).success).toBe(false);
    expect(
      RiskScoreSchema.safeParse({ ...score, factors: [first, { ...second, code: first?.code }] })
        .success,
    ).toBe(false);
    const heavy = [
      { ...first, weightBps: 6000 },
      { ...second, weightBps: 5000 },
    ];
    expect(RiskScoreSchema.safeParse({ ...score, factors: heavy }).success).toBe(false);
    expect(RiskScoreSchema.safeParse({ ...score, factors: [second, first] }).success).toBe(false);
    expect(
      RiskScoreSchema.safeParse({ ...score, factors: [{ ...first, sourceModule: "M61" }] }).success,
    ).toBe(false);
    expect(
      RiskScoreSchema.safeParse({ ...score, factors: [{ ...first, sourceModule: "M62" }] }).success,
    ).toBe(false);
  });

  it("rejects unlabelled or unreviewed decisions", () => {
    expect(RiskScoreSchema.safeParse({ ...score, aiGenerated: false }).success).toBe(false);
    expect(RiskScoreSchema.safeParse({ ...score, status: "confirmed" }).success).toBe(false);
    expect(RiskScoreSchema.safeParse({ ...score, ...reviewed }).success).toBe(false);
    expect(RiskScoreSchema.safeParse({ ...score, ...reviewed, status: "dismissed" }).success).toBe(
      false,
    );
    const early = {
      ...score,
      ...reviewed,
      status: "confirmed",
      reviewedAt: "2026-08-14T09:00:00Z",
    };
    expect(RiskScoreSchema.safeParse(early).success).toBe(false);
  });
});

describe("interventions", () => {
  it("accepts each status, with or without a risk score", () => {
    const byStatus: Record<InterventionStatus, Intervention> = {
      planned: intervention,
      in_progress: { ...intervention, status: "in_progress", riskScoreId: null, kind: "tutoring" },
      completed: {
        ...intervention,
        status: "completed",
        outcome: "Both assignments submitted; attendance back to 88%.",
      },
      cancelled: { ...intervention, status: "cancelled", reviewOn: null },
    };
    for (const value of Object.values(byStatus)) {
      expect(InterventionSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects bad dates and a completed intervention without outcome", () => {
    expect(InterventionSchema.safeParse({ ...intervention, reviewOn: "2026-08-10" }).success).toBe(
      false,
    );
    expect(InterventionSchema.safeParse({ ...intervention, status: "completed" }).success).toBe(
      false,
    );
    expect(
      InterventionSchema.safeParse({ ...intervention, updatedAt: "2026-08-15T09:00:00Z" }).success,
    ).toBe(false);
    expect(InterventionSchema.safeParse({ ...intervention, kind: "suspension" }).success).toBe(
      false,
    );
  });
});
