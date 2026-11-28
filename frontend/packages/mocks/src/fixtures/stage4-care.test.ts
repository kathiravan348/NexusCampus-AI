import * as C from "@nexus/contracts";
import { describe, expect, it } from "vitest";
import { CLASS_GROUPS } from "./academics";
import { ASSIGNMENT_SUBMISSIONS } from "./assignments";
import { ACADEMIC_CALENDARS } from "./calendars";
import { CONSENTS, DEMO_NOW } from "./compliance";
import { ISSUED_CREDENTIALS } from "./credentials";
import { OUTCOME_FRAMEWORKS, OUTCOMES } from "./curriculum";
import * as EY from "./early-years";
import { AUTHORISED_PICKUPS, GUARDIAN_RELATIONSHIPS } from "./families";
import { TENANT } from "./ids";
import * as IN from "./inclusion";
import { LEARNERS } from "./learner-records";
import * as PF from "./portfolios";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, DEMO_TENANTS, INSTITUTIONS } from "./tenants";

type TenantRow = { tenantId: string; id?: string };
type Reference = { tenantId: string; id: string };
type Parser = { safeParse(value: unknown): { error?: unknown } };

const sets: [string, Parser, readonly TenantRow[]][] = [
  ["DIARY_ENTRIES", C.DiaryEntrySchema, EY.DIARY_ENTRIES],
  ["OBSERVATIONS", C.ObservationSchema, EY.OBSERVATIONS],
  ["MILESTONE_PROGRESS", C.MilestoneProgressSchema, EY.MILESTONE_PROGRESS],
  ["PICKUP_CHECKS", C.PickupCheckSchema, EY.PICKUP_CHECKS],
  ["RATIO_SNAPSHOTS", C.RatioSnapshotSchema, EY.RATIO_SNAPSHOTS],
  ["DAY_SUMMARIES", C.DaySummarySchema, EY.DAY_SUMMARIES],
  ["SUPPORT_PLANS", C.SupportPlanSchema, IN.SUPPORT_PLANS],
  ["SUPPORT_GOALS", C.SupportGoalSchema, IN.SUPPORT_GOALS],
  ["ACCOMMODATIONS", C.AccommodationSchema, IN.ACCOMMODATIONS],
  ["SUPPORT_SESSIONS", C.SupportSessionSchema, IN.SUPPORT_SESSIONS],
  ["GOAL_PROGRESS", C.GoalProgressSchema, IN.GOAL_PROGRESS],
  ["MEDIA_SHARING_CONSENTS", C.ConsentSchema, PF.MEDIA_SHARING_CONSENTS],
  ["LEARNER_MEDIA_CONSENTS", C.LearnerMediaConsentSchema, PF.LEARNER_MEDIA_CONSENTS],
  ["MEDIA_ITEMS", C.MediaItemSchema, PF.MEDIA_ITEMS],
  ["PORTFOLIOS", C.PortfolioSchema, PF.PORTFOLIOS],
  ["PORTFOLIO_ENTRIES", C.PortfolioEntrySchema, PF.PORTFOLIO_ENTRIES],
  ["PORTFOLIO_EXPORTS", C.PortfolioExportSchema, PF.PORTFOLIO_EXPORTS],
];

const staff = ROLE_PROFILES.filter((row) => row.kind === "staff");
const consents = [...CONSENTS, ...PF.MEDIA_SHARING_CONSENTS];
const guardians = ROLE_PROFILES.filter((row) => row.kind === "guardian");
const milestones = OUTCOMES.filter((row) =>
  OUTCOME_FRAMEWORKS.some((f) => f.id === row.frameworkId && f.kind === "milestones"),
);

function ref<T extends Reference>(rows: readonly T[], id: string | null, tenantId: string): T {
  const row = rows.find((candidate) => candidate.id === id && candidate.tenantId === tenantId);
  if (!row) throw new Error("Missing fixture reference " + id + " in " + tenantId);
  return row;
}

function guardianOf(tenantId: string, guardianId: string | null, learnerId: string) {
  return GUARDIAN_RELATIONSHIPS.find(
    (r) =>
      r.tenantId === tenantId &&
      r.guardianPersonId === guardianId &&
      r.learnerPersonId === learnerId,
  );
}

function expectUnique(keys: readonly string[]) {
  expect(new Set(keys).size).toBe(keys.length);
}

function covers<T, V>(rows: readonly T[], get: (row: T) => V, values: readonly V[]) {
  expect(new Set(rows.map(get))).toEqual(new Set(values));
}

describe("Stage 4 M37, M38 and M91 fixtures (NEX-260)", () => {
  it.each(sets)("%s parse with their contract and have unique IDs", (name, schema, rows) => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(DEMO_TENANTS.some((tenant) => tenant.tenantId === row.tenantId)).toBe(true);
      expect(schema.safeParse(row).error, row.id ?? name).toBeUndefined();
      const calendar = ACADEMIC_CALENDARS.find((c) => c.tenantId === row.tenantId);
      if (!calendar) throw new Error("Missing academic calendar for " + row.tenantId);
      for (const [key, value] of Object.entries(row)) {
        // Shared fixture metadata can predate the academic year.
        if (key === "createdAt" || key === "updatedAt" || typeof value !== "string") continue;
        if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) continue;
        const day = value.slice(0, 10);
        expect(day >= calendar.startsOn && day <= calendar.endsOn, key + " " + value).toBe(true);
      }
    }
    expectUnique(rows.flatMap(({ id }) => (id === undefined ? [] : [id])));
  });

  it("keeps composite keys and outbox client IDs unique", () => {
    expectUnique(
      EY.MILESTONE_PROGRESS.map((r) => [r.tenantId, r.learnerId, r.outcomeId].join(":")),
    );
    expectUnique(EY.RATIO_SNAPSHOTS.map((r) => [r.tenantId, r.classGroupId, r.at].join(":")));
    expectUnique(PF.LEARNER_MEDIA_CONSENTS.map((r) => [r.tenantId, r.learnerId].join(":")));
    const captures = [...EY.DIARY_ENTRIES, ...EY.OBSERVATIONS, ...EY.PICKUP_CHECKS];
    expectUnique(captures.map((r) => r.clientId));
    for (const r of captures) {
      expect(r.tenantId).toBe(TENANT.littleSteps);
      ref(staff, r.recordedByStaffProfileId, r.tenantId);
      expect(r.deviceId).toBeNull();
    }
  });

  it("covers early years diary, observation, milestone and ratio examples", () => {
    covers(EY.DIARY_ENTRIES, (r) => r.kind, C.DiaryEntryKindSchema.options);
    for (const r of EY.DIARY_ENTRIES) ref(LEARNERS, r.learnerId, r.tenantId);
    expect(EY.OBSERVATIONS.some((r) => r.learnerIds.length === 2)).toBe(true);
    for (const r of EY.OBSERVATIONS) {
      for (const id of r.learnerIds) ref(LEARNERS, id, r.tenantId);
      for (const id of [...r.milestoneOutcomeIds, ...r.aiSuggestedOutcomeIds])
        ref(milestones, id, r.tenantId);
      for (const id of r.mediaItemIds) ref(PF.MEDIA_ITEMS, id, r.tenantId);
    }
    covers(EY.MILESTONE_PROGRESS, (r) => r.status, C.MilestoneStatusSchema.options);
    for (const r of EY.MILESTONE_PROGRESS) {
      expect(r.tenantId).toBe(TENANT.littleSteps);
      ref(LEARNERS, r.learnerId, r.tenantId);
      ref(milestones, r.outcomeId, r.tenantId);
      ref(staff, r.assessedByStaffProfileId, r.tenantId);
      for (const id of r.evidenceObservationIds) {
        const evidence = ref(EY.OBSERVATIONS, id, r.tenantId);
        expect(evidence.learnerIds).toContain(r.learnerId);
        expect(evidence.milestoneOutcomeIds).toContain(r.outcomeId);
      }
    }
    for (const r of EY.RATIO_SNAPSHOTS) {
      expect(r.tenantId).toBe(TENANT.littleSteps);
      ref(CLASS_GROUPS, r.classGroupId, r.tenantId);
    }
    expect(EY.RATIO_SNAPSHOTS.filter((r) => !r.withinRatio)).toHaveLength(1);
  });

  it("covers collector kinds and verification methods and refuses an unauthorised collector", () => {
    covers(EY.PICKUP_CHECKS, (r) => r.collectorKind, C.CollectorKindSchema.options);
    covers(EY.PICKUP_CHECKS, (r) => r.verification, C.PickupVerificationSchema.options);
    expect(EY.PICKUP_CHECKS.filter((r) => r.outcome === "refused")).toHaveLength(1);
    for (const r of EY.PICKUP_CHECKS) {
      const learner = ref(LEARNERS, r.learnerId, r.tenantId);
      if (r.collectorKind === "authorised_person") {
        const pickup = ref(AUTHORISED_PICKUPS, r.collectorRefId, r.tenantId);
        expect(pickup.learnerPersonId).toBe(learner.personId);
      }
      if (r.collectorKind === "guardian") {
        expect(
          guardians.some((p) => p.tenantId === r.tenantId && p.personId === r.collectorRefId),
        ).toBe(true);
        const link = guardianOf(r.tenantId, r.collectorRefId, learner.personId);
        expect(link?.pickupRight === "allowed").toBe(r.outcome === "released");
      }
      if (r.outcome === "refused") {
        expect(r.kind).toBe("pick_up");
        expect(r.refusedReason).toBeTruthy();
        expect(AUTHORISED_PICKUPS.some((p) => p.id === r.collectorRefId)).toBe(false);
      }
    }
  });

  it("uses shared sources and guardian consent for both day summary states", () => {
    expect(EY.DAY_SUMMARIES.map((r) => r.status).sort()).toEqual(["draft", "sent"]);
    for (const r of EY.DAY_SUMMARIES) {
      expect(r.tenantId).toBe(TENANT.littleSteps);
      const learner = ref(LEARNERS, r.learnerId, r.tenantId);
      const hasConsent = CONSENTS.some(
        (c) =>
          c.tenantId === r.tenantId &&
          c.personId === learner.personId &&
          c.purpose === "ai_features" &&
          c.status === "granted" &&
          c.recordedAt.slice(0, 10) <= r.date &&
          guardianOf(r.tenantId, c.givenByPersonId, learner.personId) !== undefined,
      );
      expect(hasConsent).toBe(true);
      if (r.status === "sent") ref(staff, r.sentByStaffProfileId, r.tenantId);
      for (const source of r.sources) {
        expect(source).toMatchObject({ moduleId: "M37", recordType: "diaryEntry" });
        const d = ref(EY.DIARY_ENTRIES, source.recordId, r.tenantId);
        expect(d).toMatchObject({ learnerId: r.learnerId, date: r.date, sharedWithFamily: true });
      }
    }
  });

  it("links inclusion records and preserves human decisions", () => {
    covers(IN.SUPPORT_PLANS, (r) => r.tenantId, [TENANT.riverside, TENANT.northbridge]);
    covers(IN.SUPPORT_PLANS, (r) => r.kind, C.SupportPlanKindSchema.options);
    covers(IN.SUPPORT_PLANS, (r) => r.status, C.SupportPlanStatusSchema.options);
    expect(IN.SUPPORT_PLANS).toContainEqual(
      expect.objectContaining({ status: "draft", guardian: "invited" }),
    );
    for (const r of IN.SUPPORT_PLANS) {
      ref(LEARNERS, r.learnerId, r.tenantId);
      for (const id of r.teamStaffProfileIds) ref(staff, id, r.tenantId);
    }
    covers(IN.SUPPORT_GOALS, (r) => r.status, C.SupportGoalStatusSchema.options);
    const aiGoal = IN.SUPPORT_GOALS.find((r) => r.source === "ai_draft");
    expect(aiGoal?.status).toBe("active");
    expect(aiGoal?.statement).not.toBe(aiGoal?.aiDraftStatement);
    for (const r of IN.SUPPORT_GOALS) {
      const plan = ref(IN.SUPPORT_PLANS, r.planId, r.tenantId);
      if (r.status !== "draft")
        expect(plan.teamStaffProfileIds).toContain(r.approvedByStaffProfileId);
      for (const id of r.outcomeIds) ref(OUTCOMES, id, r.tenantId);
    }
    const extraTime = IN.ACCOMMODATIONS.find((r) => r.category === "extra_time");
    expect(extraTime).toMatchObject({ active: true, appliesTo: "all", extraTimePercent: 25 });
    for (const r of IN.ACCOMMODATIONS)
      expect(ref(IN.SUPPORT_PLANS, r.planId, r.tenantId).status).toBe("active");
    for (const r of IN.SUPPORT_SESSIONS) {
      ref(IN.SUPPORT_PLANS, r.planId, r.tenantId);
      ref(staff, r.deliveredByStaffProfileId, r.tenantId);
      if (r.goalId !== null)
        expect(ref(IN.SUPPORT_GOALS, r.goalId, r.tenantId).planId).toBe(r.planId);
    }
    covers(IN.GOAL_PROGRESS, (r) => r.rating, C.GoalProgressRatingSchema.options);
    for (const r of IN.GOAL_PROGRESS) {
      ref(IN.SUPPORT_GOALS, r.goalId, r.tenantId);
      ref(staff, r.recordedByStaffProfileId, r.tenantId);
    }
  });

  it("matches media consent to the guardian grants and derives each item's sharing state", () => {
    expectUnique(consents.map((r) => r.id));
    expectUnique(consents.map((r) => [r.tenantId, r.personId, r.purpose].join(":")));
    expect(PF.MEDIA_SHARING_CONSENTS.map((r) => r.tenantId).sort()).toEqual(
      [TENANT.littleSteps, TENANT.riverside, TENANT.riverside].sort(),
    );
    for (const r of PF.MEDIA_SHARING_CONSENTS) {
      expect(r).toMatchObject({ status: "granted", purpose: "media_sharing" });
      expect(r.recordedAt > CREATED_AT).toBe(true);
      expect(guardianOf(r.tenantId, r.givenByPersonId, r.personId)).toBeDefined();
    }
    covers(PF.LEARNER_MEDIA_CONSENTS, (r) => r.status, C.MediaConsentStatusSchema.options);
    for (const r of PF.LEARNER_MEDIA_CONSENTS) {
      const learner = ref(LEARNERS, r.learnerId, r.tenantId);
      const source = consents.find(
        (c) =>
          c.tenantId === r.tenantId &&
          c.personId === learner.personId &&
          c.purpose === "media_sharing",
      );
      expect(source?.status).toBe(
        { allowed: "granted", opted_out: "withdrawn", pending: "pending" }[r.status],
      );
      expect(r.consentId).toBe(r.status === "pending" ? null : source?.id);
    }
    covers(PF.MEDIA_ITEMS, (r) => r.visibility, C.MediaVisibilitySchema.options);
    covers(PF.MEDIA_ITEMS, (r) => r.consentState, C.MediaConsentStateSchema.options);
    expect(PF.MEDIA_ITEMS.filter((r) => r.aiCaption !== null)).toHaveLength(1);
    for (const r of PF.MEDIA_ITEMS) {
      ref(INSTITUTIONS, r.institutionId, r.tenantId);
      expect(ref(staff, r.uploadedByProfileId, r.tenantId).institutionId).toBe(r.institutionId);
      const statuses = r.taggedLearnerIds.map((id) => {
        expect(ref(LEARNERS, id, r.tenantId).institutionId).toBe(r.institutionId);
        const match = PF.LEARNER_MEDIA_CONSENTS.find((c) => c.learnerId === id);
        expect(match?.tenantId).toBe(r.tenantId);
        return match?.status;
      });
      const blocked = statuses.includes("opted_out");
      const cleared = statuses.length > 0 && statuses.every((status) => status === "allowed");
      expect(r.consentState).toBe(blocked ? "blocked" : cleared ? "cleared" : "pending");
      for (const id of [...r.outcomeIds, ...r.aiSuggestedOutcomeIds]) ref(OUTCOMES, id, r.tenantId);
    }
  });

  it("links portfolio evidence and covers export states", () => {
    covers(PF.PORTFOLIOS, (r) => r.tenantId, [TENANT.littleSteps, TENANT.riverside]);
    for (const r of PF.PORTFOLIOS) ref(LEARNERS, r.learnerId, r.tenantId);
    covers(PF.PORTFOLIO_ENTRIES, (r) => r.kind, C.PortfolioEntryKindSchema.options);
    for (const r of PF.PORTFOLIO_ENTRIES) {
      const { learnerId } = ref(PF.PORTFOLIOS, r.portfolioId, r.tenantId);
      expect(ref(ROLE_PROFILES, r.addedByProfileId, r.tenantId).kind).toBe(r.addedByRole);
      for (const id of r.outcomeIds) ref(OUTCOMES, id, r.tenantId);
      if (r.kind === "media") {
        const media = ref(PF.MEDIA_ITEMS, r.refId, r.tenantId);
        expect(media.taggedLearnerIds).toContain(learnerId);
        expect(media.consentState).toBe("cleared");
      }
      if (r.kind === "observation")
        expect(ref(EY.OBSERVATIONS, r.refId, r.tenantId).learnerIds).toContain(learnerId);
      if (r.kind === "assignment_submission")
        expect(ref(ASSIGNMENT_SUBMISSIONS, r.refId, r.tenantId).learnerId).toBe(learnerId);
      if (r.kind === "credential")
        expect(ref(ISSUED_CREDENTIALS, r.refId, r.tenantId).learnerId).toBe(learnerId);
    }
    covers(PF.PORTFOLIO_EXPORTS, (r) => r.status, C.PortfolioExportStatusSchema.options);
    for (const r of PF.PORTFOLIO_EXPORTS) {
      const portfolio = ref(PF.PORTFOLIOS, r.portfolioId, r.tenantId);
      const learner = ref(LEARNERS, portfolio.learnerId, r.tenantId);
      const requester = ref(ROLE_PROFILES, r.requestedByProfileId, r.tenantId);
      if (requester.kind === "guardian")
        expect(guardianOf(r.tenantId, requester.personId, learner.personId)).toBeDefined();
      if (requester.kind === "learner") expect(requester.id).toBe(learner.roleProfileId);
      if (r.expiresAt !== null) expect(r.expiresAt < DEMO_NOW).toBe(r.status === "expired");
      expect(r).not.toHaveProperty("url");
    }
  });
});
