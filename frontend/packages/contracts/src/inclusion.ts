import { z } from "zod";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";

/**
 * M38 special education and inclusion (NEX-250, D87). Every M38 record is restricted personal data (G-6, V-7): read only
 * by the plan team, staff holding the M38 permission and the learner's guardians (and the learner where the institution
 * allows). `needsSummary` is health-like data: it never reaches the AI gateway, another learner's view, an export for
 * anyone outside the plan team, or a log. AI goal drafts are off unless the institution switches them on, use only the
 * goal area, outcomes and progress ratings, and become active only after a person approves them (A-3, A-4). M21 exams
 * and M33 online tests read active accommodations to adjust time and rooms.
 */

const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const uniqueIds = (max: number) =>
  z.array(IdSchema).max(max).refine(isUnique, { message: "ids must be unique" });

export const SupportPlanKindSchema = z.enum(["iep", "ilp", "accommodation_plan", "other"]);
export type SupportPlanKind = z.infer<typeof SupportPlanKindSchema>;

export const SupportPlanStatusSchema = z.enum(["draft", "active", "under_review", "closed"]);
export type SupportPlanStatus = z.infer<typeof SupportPlanStatusSchema>;

export const GuardianParticipationSchema = z.enum([
  "invited",
  "agreed",
  "declined",
  "not_applicable",
]);
export type GuardianParticipation = z.infer<typeof GuardianParticipationSchema>;

export const SupportPlanSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    kind: SupportPlanKindSchema,
    status: SupportPlanStatusSchema,
    startOn: IsoDateSchema,
    reviewOn: IsoDateSchema,
    /** Set exactly when the plan is closed. */
    endOn: IsoDateSchema.nullable(),
    coordinatorStaffProfileId: IdSchema,
    teamStaffProfileIds: uniqueIds(20).min(1),
    guardian: GuardianParticipationSchema,
    guardianRespondedOn: IsoDateSchema.nullable(),
    strengths: z.string().trim().max(4000),
    /** Restricted, health-like data — never sent to AI, logs or outside exports. */
    needsSummary: z.string().trim().max(4000),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((plan) => Date.parse(plan.updatedAt) >= Date.parse(plan.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine((plan) => plan.reviewOn >= plan.startOn, {
    message: "reviewOn is before startOn",
    path: ["reviewOn"],
  })
  .refine((plan) => (plan.status === "closed") === (plan.endOn !== null), {
    message: "endOn is set exactly when the plan is closed",
    path: ["endOn"],
  })
  .refine((plan) => plan.endOn === null || plan.endOn >= plan.startOn, {
    message: "endOn is before startOn",
    path: ["endOn"],
  })
  .refine((plan) => plan.teamStaffProfileIds.includes(plan.coordinatorStaffProfileId), {
    message: "the coordinator is part of the team",
    path: ["teamStaffProfileIds"],
  })
  .refine(
    (plan) =>
      (plan.guardian === "agreed" || plan.guardian === "declined") ===
      (plan.guardianRespondedOn !== null),
    {
      message: "guardianRespondedOn is set exactly when the guardian agreed or declined",
      path: ["guardianRespondedOn"],
    },
  );
export type SupportPlan = z.infer<typeof SupportPlanSchema>;

export const SupportGoalAreaSchema = z.enum([
  "communication",
  "literacy",
  "numeracy",
  "social_emotional",
  "motor",
  "independence",
  "other",
]);
export type SupportGoalArea = z.infer<typeof SupportGoalAreaSchema>;

export const SupportGoalStatusSchema = z.enum(["draft", "active", "achieved", "discontinued"]);
export type SupportGoalStatus = z.infer<typeof SupportGoalStatusSchema>;

export const SupportGoalSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    planId: IdSchema,
    area: SupportGoalAreaSchema,
    statement: z.string().trim().min(1).max(1000),
    /** How progress is measured. */
    measure: z.string().trim().min(1).max(500),
    targetDate: IsoDateSchema,
    outcomeIds: uniqueIds(10),
    source: z.enum(["manual", "ai_draft"]),
    status: SupportGoalStatusSchema,
    approvedByStaffProfileId: IdSchema.nullable(),
    approvedAt: UtcDateTimeSchema.nullable(),
  })
  .refine(
    (goal) =>
      (goal.status !== "draft") === (goal.approvedByStaffProfileId !== null) &&
      (goal.status !== "draft") === (goal.approvedAt !== null),
    {
      message: "a goal leaves draft only with a person's approval",
      path: ["approvedByStaffProfileId"],
    },
  );
export type SupportGoal = z.infer<typeof SupportGoalSchema>;

export const AccommodationCategorySchema = z.enum([
  "extra_time",
  "separate_room",
  "reader",
  "scribe",
  "assistive_technology",
  "rest_breaks",
  "modified_materials",
  "seating",
  "other",
]);
export type AccommodationCategory = z.infer<typeof AccommodationCategorySchema>;

export const AccommodationSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    planId: IdSchema,
    category: AccommodationCategorySchema,
    details: z.string().trim().max(500),
    appliesTo: z.enum(["classroom", "tests", "exams", "all"]),
    /** Set exactly for extra time. */
    extraTimePercent: z.int().min(1).max(100).nullable(),
    active: z.boolean(),
    startOn: IsoDateSchema,
    endOn: IsoDateSchema.nullable(),
  })
  .refine((item) => (item.category === "extra_time") === (item.extraTimePercent !== null), {
    message: "extraTimePercent is set exactly for extra time",
    path: ["extraTimePercent"],
  })
  .refine((item) => item.endOn === null || item.endOn >= item.startOn, {
    message: "endOn is before startOn",
    path: ["endOn"],
  });
export type Accommodation = z.infer<typeof AccommodationSchema>;

export const SupportSessionSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  planId: IdSchema,
  goalId: IdSchema.nullable(),
  date: IsoDateSchema,
  minutes: z.int().min(1).max(600),
  deliveredByStaffProfileId: IdSchema,
  note: z.string().trim().max(2000).nullable(),
});
export type SupportSession = z.infer<typeof SupportSessionSchema>;

export const GoalProgressRatingSchema = z.enum([
  "not_started",
  "emerging",
  "progressing",
  "achieved",
]);
export type GoalProgressRating = z.infer<typeof GoalProgressRatingSchema>;

export const GoalProgressSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  goalId: IdSchema,
  recordedOn: IsoDateSchema,
  rating: GoalProgressRatingSchema,
  note: z.string().trim().max(2000).nullable(),
  recordedByStaffProfileId: IdSchema,
});
export type GoalProgress = z.infer<typeof GoalProgressSchema>;
