import { z } from "zod";
import { CapabilityTierSchema } from "./ai";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";

/**
 * M46 learning analytics and early warning (NEX-248, D87).
 *
 * Rules the server enforces (A-3, A-4, V-7): risk scores are read only with an M46 staff permission and are never shown
 * to learners or families; no score starts an intervention, message or record change by itself — a person reviews it
 * and plans any intervention; factors never use health (M61) or safeguarding (M62) data; the server keeps each score's
 * model inputs for audit; a learner's data is used only while the tenant's AI switch and M46 are on.
 */

const count = z.int().min(0);
const bps = z.int().min(0).max(10000);
const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);

export const EngagementSnapshotSchema = z
  .strictObject({
    tenantId: IdSchema,
    learnerId: IdSchema,
    /** Null = across all of the learner's courses. */
    courseSpaceId: IdSchema.nullable(),
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
    logins: count,
    activeMinutes: count,
    itemsCompleted: count,
    submissionsOnTime: count,
    submissionsLate: count,
    submissionsMissing: count,
    /** From M17 attendance. */
    attendanceBps: bps.nullable(),
    averageScoreBps: bps.nullable(),
    computedAt: UtcDateTimeSchema,
  })
  .refine((snapshot) => snapshot.periodEnd >= snapshot.periodStart, {
    message: "periodEnd is before periodStart",
    path: ["periodEnd"],
  });
export type EngagementSnapshot = z.infer<typeof EngagementSnapshotSchema>;

export const RiskFactorCodeSchema = z.enum([
  "attendance_drop",
  "missing_work",
  "late_work",
  "low_scores",
  "score_decline",
  "low_engagement",
]);
export type RiskFactorCode = z.infer<typeof RiskFactorCodeSchema>;

/** Modules a factor may come from — never health (M61) or safeguarding (M62). */
export const RiskFactorSourceSchema = z.enum(["M17", "M20", "M30", "M32", "M33", "M35"]);
export type RiskFactorSource = z.infer<typeof RiskFactorSourceSchema>;

export const RiskFactorSchema = z.strictObject({
  code: RiskFactorCodeSchema,
  weightBps: z.int().min(1).max(10000),
  /** Plain words a teacher can check (A-5). */
  detail: z.string().trim().min(1).max(300),
  sourceModule: RiskFactorSourceSchema,
});
export type RiskFactor = z.infer<typeof RiskFactorSchema>;

export const RiskLevelSchema = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const RiskReviewStatusSchema = z.enum(["open", "confirmed", "dismissed"]);
export type RiskReviewStatus = z.infer<typeof RiskReviewStatusSchema>;

/** An AI prediction with its main factors, waiting for a person's review (A-4, A-5). */
export const RiskScoreSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    aiGenerated: z.literal(true),
    tier: CapabilityTierSchema,
    modelVersion: z.string().trim().min(1).max(64),
    scoreBps: bps,
    level: RiskLevelSchema,
    /** Main factors, highest weight first. */
    factors: z.array(RiskFactorSchema).min(1).max(8),
    computedAt: UtcDateTimeSchema,
    status: RiskReviewStatusSchema,
    reviewedByStaffProfileId: IdSchema.nullable(),
    reviewedAt: UtcDateTimeSchema.nullable(),
    reviewNote: z.string().trim().min(1).max(1000).nullable(),
  })
  .refine(
    (score) => new Set(score.factors.map((factor) => factor.code)).size === score.factors.length,
    {
      message: "factor codes must be unique",
      path: ["factors"],
    },
  )
  .refine((score) => score.factors.reduce((sum, factor) => sum + factor.weightBps, 0) <= 10000, {
    message: "factor weights add up to more than 10000",
    path: ["factors"],
  })
  .refine(
    (score) =>
      score.factors.every(
        (factor, index, all) => index === 0 || (all[index - 1]?.weightBps ?? 0) >= factor.weightBps,
      ),
    { message: "factors are sorted by weight, highest first", path: ["factors"] },
  )
  .refine(
    (score) =>
      (score.status !== "open") === (score.reviewedByStaffProfileId !== null) &&
      (score.status !== "open") === (score.reviewedAt !== null),
    {
      message: "a person and a time are recorded exactly when the score is reviewed",
      path: ["reviewedByStaffProfileId"],
    },
  )
  .refine((score) => score.reviewedAt === null || isNotBefore(score.reviewedAt, score.computedAt), {
    message: "reviewedAt is before computedAt",
    path: ["reviewedAt"],
  })
  .refine((score) => score.status !== "dismissed" || score.reviewNote !== null, {
    message: "a dismissed score needs a note",
    path: ["reviewNote"],
  });
export type RiskScore = z.infer<typeof RiskScoreSchema>;

export const InterventionKindSchema = z.enum([
  "meeting",
  "tutoring",
  "family_contact",
  "learning_plan",
  "counselling_referral",
  "other",
]);
export type InterventionKind = z.infer<typeof InterventionKindSchema>;

export const InterventionStatusSchema = z.enum([
  "planned",
  "in_progress",
  "completed",
  "cancelled",
]);
export type InterventionStatus = z.infer<typeof InterventionStatusSchema>;

/** A person's plan to support a learner; staff may act with or without a risk score. */
export const InterventionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    riskScoreId: IdSchema.nullable(),
    kind: InterventionKindSchema,
    title: z.string().trim().min(1).max(200),
    /** Personal data (V-7). */
    plan: z.string().trim().max(2000),
    ownerStaffProfileId: IdSchema,
    createdByStaffProfileId: IdSchema,
    status: InterventionStatusSchema,
    startOn: IsoDateSchema,
    reviewOn: IsoDateSchema.nullable(),
    /** Personal data (V-7); required when completed. */
    outcome: z.string().trim().min(1).max(2000).nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((intervention) => isNotBefore(intervention.updatedAt, intervention.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine(
    (intervention) =>
      intervention.reviewOn === null || intervention.reviewOn >= intervention.startOn,
    {
      message: "reviewOn is before startOn",
      path: ["reviewOn"],
    },
  )
  .refine((intervention) => intervention.status !== "completed" || intervention.outcome !== null, {
    message: "a completed intervention records its outcome",
    path: ["outcome"],
  });
export type Intervention = z.infer<typeof InterventionSchema>;
