import { describe, expect, it } from "vitest";
import {
  PromotionDecisionInputSchema,
  PromotionDecisionSchema,
  RolloverRunInputSchema,
  RolloverRunSchema,
} from "./rollover";

const completedRun = {
  id: "roll-1",
  tenantId: "ten-1",
  institutionId: "inst-1",
  fromAcademicYearId: "ay-2025",
  toAcademicYearId: "ay-2026",
  status: "completed",
  counts: {
    promote: 120,
    detain: 4,
    graduate: 30,
    transfer: 2,
    skip: 1,
  },
  carryForwardFees: true,
  rollbackUntil: "2026-04-30T18:30:00Z",
  createdByStaffProfileId: "rp-staff-1",
  createdAt: "2026-03-25T09:00:00Z",
  updatedAt: "2026-03-25T10:30:00Z",
};

const promoteDecision = {
  id: "dec-1",
  tenantId: "ten-1",
  runId: "roll-1",
  learnerId: "lrn-1",
  action: "promote",
  toClassGroupId: "cg-6a",
  reasonKey: "m86.rollover.meritPromotion",
  overriddenByStaffProfileId: null,
};

const graduateDecision = {
  id: "dec-2",
  tenantId: "ten-1",
  runId: "roll-1",
  learnerId: "lrn-2",
  action: "graduate",
  toClassGroupId: null,
  reasonKey: null,
  overriddenByStaffProfileId: "rp-staff-2",
};

const fails = (result: { success: boolean }) => expect(result.success).toBe(false);

describe("RolloverRunSchema", () => {
  it("accepts a completed rollover run and a draft run without rollbackUntil", () => {
    expect(RolloverRunSchema.parse(completedRun)).toEqual(completedRun);
    const draftRun = {
      ...completedRun,
      id: "roll-2",
      status: "draft",
      rollbackUntil: null,
    };
    expect(RolloverRunSchema.parse(draftRun)).toEqual(draftRun);
  });

  it("rejects the same from and to academic year", () => {
    const sameYear = { ...completedRun, toAcademicYearId: completedRun.fromAcademicYearId };
    fails(RolloverRunSchema.safeParse(sameYear));
  });

  it("enforces rollbackUntil iff completed, timestamp order, and strict objects", () => {
    fails(RolloverRunSchema.safeParse({ ...completedRun, rollbackUntil: null }));
    fails(RolloverRunSchema.safeParse({ ...completedRun, status: "running" }));
    fails(RolloverRunSchema.safeParse({ ...completedRun, updatedAt: "2026-03-25T08:00:00Z" }));
    const negativeCount = { ...completedRun, counts: { ...completedRun.counts, promote: -1 } };
    const extraCount = { ...completedRun, counts: { ...completedRun.counts, extra: 1 } };
    fails(RolloverRunSchema.safeParse(negativeCount));
    fails(RolloverRunSchema.safeParse(extraCount));
    fails(RolloverRunSchema.safeParse({ ...completedRun, extra: true }));
  });
});

describe("PromotionDecisionSchema", () => {
  it("accepts promote, detain, graduate, transfer, and skip decisions", () => {
    expect(PromotionDecisionSchema.parse(promoteDecision)).toEqual(promoteDecision);
    const detain = { ...promoteDecision, id: "dec-det", action: "detain", toClassGroupId: "cg-5a" };
    const transfer = { ...graduateDecision, id: "dec-tr", action: "transfer" };
    const skip = { ...graduateDecision, id: "dec-sk", action: "skip" };
    expect(PromotionDecisionSchema.parse(detain)).toEqual(detain);
    expect(PromotionDecisionSchema.parse(graduateDecision)).toEqual(graduateDecision);
    expect(PromotionDecisionSchema.parse(transfer)).toEqual(transfer);
    expect(PromotionDecisionSchema.parse(skip)).toEqual(skip);
  });

  it("rejects promote/detain without toClassGroupId, others with it, and extra keys", () => {
    const promoteNoTarget = { ...promoteDecision, toClassGroupId: null };
    const detainNoTarget = { ...promoteDecision, action: "detain", toClassGroupId: null };
    const graduateWithTarget = { ...graduateDecision, toClassGroupId: "cg-6a" };
    fails(PromotionDecisionSchema.safeParse(promoteNoTarget));
    fails(PromotionDecisionSchema.safeParse(detainNoTarget));
    fails(PromotionDecisionSchema.safeParse(graduateWithTarget));
    fails(PromotionDecisionSchema.safeParse({ ...promoteDecision, extra: true }));
  });
});

describe("RolloverRunInputSchema", () => {
  const input = {
    institutionId: "ins-1",
    fromAcademicYearId: "cal-2026",
    toAcademicYearId: "cal-2027",
    carryForwardFees: false,
  };

  it("accepts a run between two different years", () => {
    expect(RolloverRunInputSchema.parse(input)).toEqual(input);
  });

  it("rejects the same year, a missing flag and extra keys", () => {
    fails(RolloverRunInputSchema.safeParse({ ...input, toAcademicYearId: "cal-2026" }));
    fails(RolloverRunInputSchema.safeParse({ ...input, carryForwardFees: undefined }));
    fails(RolloverRunInputSchema.safeParse({ ...input, status: "completed" }));
  });
});

describe("PromotionDecisionInputSchema", () => {
  it("accepts targets for promote and detain only", () => {
    const detain = {
      action: "detain",
      toClassGroupId: "cg-5a",
      reasonKey: "m86.promotion.ageEligibility",
    };
    const graduate = { action: "graduate", toClassGroupId: null, reasonKey: null };
    expect(PromotionDecisionInputSchema.parse(detain)).toEqual(detain);
    expect(PromotionDecisionInputSchema.parse(graduate)).toEqual(graduate);
  });

  it("rejects a missing or extra target, bad reason keys and extra keys", () => {
    fails(
      PromotionDecisionInputSchema.safeParse({
        action: "promote",
        toClassGroupId: null,
        reasonKey: null,
      }),
    );
    fails(
      PromotionDecisionInputSchema.safeParse({
        action: "skip",
        toClassGroupId: "cg-1",
        reasonKey: null,
      }),
    );
    fails(
      PromotionDecisionInputSchema.safeParse({
        action: "skip",
        toClassGroupId: null,
        reasonKey: "Not a key",
      }),
    );
    fails(
      PromotionDecisionInputSchema.safeParse({
        action: "skip",
        toClassGroupId: null,
        reasonKey: null,
        learnerId: "lrn-1",
      }),
    );
  });
});
