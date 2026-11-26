import { describe, expect, it } from "vitest";
import {
  AccommodationSchema,
  GoalProgressSchema,
  SupportGoalSchema,
  SupportPlanSchema,
  SupportSessionSchema,
  type Accommodation,
  type AccommodationCategory,
  type GoalProgressRating,
  type SupportGoal,
  type SupportPlan,
} from "./index";

const iep: SupportPlan = {
  id: "plan-aarav-iep",
  tenantId: "tenant-school",
  learnerId: "learner-aarav",
  kind: "iep",
  status: "active",
  startOn: "2026-06-15",
  reviewOn: "2026-10-15",
  endOn: null,
  coordinatorStaffProfileId: "staff-senco",
  teamStaffProfileIds: ["staff-senco", "staff-maths"],
  guardian: "agreed",
  guardianRespondedOn: "2026-06-12",
  strengths: "Strong visual memory; enjoys building.",
  needsSummary: "Needs support with reading fluency.",
  createdAt: "2026-06-01T08:00:00Z",
  updatedAt: "2026-06-12T08:00:00Z",
};
const goal: SupportGoal = {
  id: "goal-reading",
  tenantId: "tenant-school",
  planId: iep.id,
  area: "literacy",
  statement: "Read a grade 3 passage at 60 words per minute.",
  measure: "Monthly one-minute reading check.",
  targetDate: "2026-10-01",
  outcomeIds: [],
  source: "manual",
  aiDraftStatement: null,
  status: "active",
  approvedByStaffProfileId: "staff-senco",
  approvedAt: "2026-06-12T09:00:00Z",
};
const extraTime: Accommodation = {
  id: "accommodation-extra-time",
  tenantId: "tenant-school",
  planId: iep.id,
  category: "extra_time",
  details: "25% extra time on written tests.",
  appliesTo: "all",
  extraTimePercent: 25,
  active: true,
  startOn: "2026-06-15",
  endOn: null,
};

describe("support plans", () => {
  it("accepts an agreed IEP, an adult ILP and a closed plan", () => {
    expect(SupportPlanSchema.safeParse(iep).success).toBe(true);
    const ilp = {
      ...iep,
      id: "plan-ilp",
      kind: "ilp",
      guardian: "not_applicable",
      guardianRespondedOn: null,
    };
    expect(SupportPlanSchema.safeParse(ilp).success).toBe(true);
    expect(
      SupportPlanSchema.safeParse({ ...iep, status: "closed", endOn: "2027-03-31" }).success,
    ).toBe(true);
    const invited = { ...iep, status: "draft", guardian: "invited", guardianRespondedOn: null };
    expect(SupportPlanSchema.safeParse(invited).success).toBe(true);
  });

  it("rejects bad dates, teams and guardian records", () => {
    expect(SupportPlanSchema.safeParse({ ...iep, reviewOn: "2026-06-01" }).success).toBe(false);
    expect(SupportPlanSchema.safeParse({ ...iep, status: "closed" }).success).toBe(false);
    expect(SupportPlanSchema.safeParse({ ...iep, endOn: "2027-03-31" }).success).toBe(false);
    expect(
      SupportPlanSchema.safeParse({ ...iep, teamStaffProfileIds: ["staff-maths"] }).success,
    ).toBe(false);
    expect(SupportPlanSchema.safeParse({ ...iep, guardianRespondedOn: null }).success).toBe(false);
    expect(SupportPlanSchema.safeParse({ ...iep, diagnosis: "…" }).success).toBe(false);
  });
});

describe("support goals", () => {
  it("accepts a manual goal, an approved AI draft and an unapproved draft", () => {
    expect(SupportGoalSchema.safeParse(goal).success).toBe(true);
    expect(
      SupportGoalSchema.safeParse({
        ...goal,
        source: "ai_draft",
        aiDraftStatement: "Read 60 words a minute.",
      }).success,
    ).toBe(true);
    expect(SupportGoalSchema.safeParse({ ...goal, source: "ai_draft" }).success).toBe(false);
    expect(SupportGoalSchema.safeParse({ ...goal, aiDraftStatement: "x" }).success).toBe(false);
    const draft = {
      ...goal,
      source: "ai_draft",
      aiDraftStatement: "Read fluently.",
      status: "draft",
      approvedByStaffProfileId: null,
      approvedAt: null,
    };
    expect(SupportGoalSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects an active goal without approval and a draft with approval", () => {
    expect(
      SupportGoalSchema.safeParse({ ...goal, approvedByStaffProfileId: null, approvedAt: null })
        .success,
    ).toBe(false);
    expect(SupportGoalSchema.safeParse({ ...goal, status: "draft" }).success).toBe(false);
    expect(SupportGoalSchema.safeParse({ ...goal, measure: " " }).success).toBe(false);
  });
});

describe("accommodations, sessions and progress", () => {
  it("accepts each accommodation category", () => {
    const categories: AccommodationCategory[] = [
      "separate_room",
      "reader",
      "scribe",
      "assistive_technology",
      "rest_breaks",
      "modified_materials",
      "seating",
      "other",
    ];
    expect(AccommodationSchema.safeParse(extraTime).success).toBe(true);
    for (const category of categories) {
      expect(
        AccommodationSchema.safeParse({ ...extraTime, category, extraTimePercent: null }).success,
      ).toBe(true);
    }
  });

  it("rejects extra time without percent and a percent elsewhere", () => {
    expect(AccommodationSchema.safeParse({ ...extraTime, extraTimePercent: null }).success).toBe(
      false,
    );
    expect(AccommodationSchema.safeParse({ ...extraTime, category: "seating" }).success).toBe(
      false,
    );
    expect(AccommodationSchema.safeParse({ ...extraTime, endOn: "2026-06-01" }).success).toBe(
      false,
    );
  });

  it("accepts a session and each progress rating, rejects zero minutes", () => {
    const session = {
      id: "session-1",
      tenantId: "tenant-school",
      planId: iep.id,
      goalId: goal.id,
      date: "2026-07-01",
      minutes: 30,
      deliveredByStaffProfileId: "staff-senco",
      note: null,
    };
    expect(SupportSessionSchema.safeParse(session).success).toBe(true);
    expect(SupportSessionSchema.safeParse({ ...session, minutes: 0 }).success).toBe(false);
    const ratings: GoalProgressRating[] = ["not_started", "emerging", "progressing", "achieved"];
    for (const rating of ratings) {
      const progress = {
        id: `progress-${rating}`,
        tenantId: "tenant-school",
        goalId: goal.id,
        recordedOn: "2026-07-31",
        rating,
        note: null,
        recordedByStaffProfileId: "staff-senco",
      };
      expect(GoalProgressSchema.safeParse(progress).success).toBe(true);
    }
  });
});
