import { z } from "zod";
import { IdSchema, UtcDateTimeSchema } from "./common";
import { MessageKeySchema } from "./studio";

const timestamps = {
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
};
const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

export const RolloverRunStatusSchema = z.enum([
  "draft",
  "dry_run_ready",
  "running",
  "completed",
  "rolled_back",
  "failed",
]);
export type RolloverRunStatus = z.infer<typeof RolloverRunStatusSchema>;

export const RolloverCountsSchema = z.strictObject({
  promote: z.int().min(0),
  detain: z.int().min(0),
  graduate: z.int().min(0),
  transfer: z.int().min(0),
  skip: z.int().min(0),
});
export type RolloverCounts = z.infer<typeof RolloverCountsSchema>;

/** Year-end academic rollover run (M86) moving learners from one academic year to the next. */
export const RolloverRunSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    fromAcademicYearId: IdSchema,
    toAcademicYearId: IdSchema,
    status: RolloverRunStatusSchema,
    counts: RolloverCountsSchema,
    carryForwardFees: z.boolean(),
    rollbackUntil: UtcDateTimeSchema.nullable(),
    createdByStaffProfileId: IdSchema,
    ...timestamps,
  })
  .refine((run) => run.toAcademicYearId !== run.fromAcademicYearId, {
    message: "toAcademicYearId must differ from fromAcademicYearId",
    path: ["toAcademicYearId"],
  })
  .refine((run) => (run.rollbackUntil !== null) === (run.status === "completed"), {
    message: "rollbackUntil must be set iff status is completed",
    path: ["rollbackUntil"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type RolloverRun = z.infer<typeof RolloverRunSchema>;

export const PromotionActionSchema = z.enum(["promote", "detain", "graduate", "transfer", "skip"]);
export type PromotionAction = z.infer<typeof PromotionActionSchema>;

const needsTargetClassGroup = (action: PromotionAction) =>
  action === "promote" || action === "detain";

/** Per-learner promotion decision inside a rollover run (M86). */
export const PromotionDecisionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    runId: IdSchema,
    learnerId: IdSchema,
    action: PromotionActionSchema,
    toClassGroupId: IdSchema.nullable(),
    reasonKey: MessageKeySchema.nullable(),
    overriddenByStaffProfileId: IdSchema.nullable(),
  })
  .refine((d) => (d.toClassGroupId !== null) === needsTargetClassGroup(d.action), {
    message: "toClassGroupId must be set iff action is promote or detain",
    path: ["toClassGroupId"],
  });
export type PromotionDecision = z.infer<typeof PromotionDecisionSchema>;

/**
 * Starts a rollover run with its dry run (M86, D84): one decision per learner with an active enrolment in a class
 * group of the institution in the from-year. `carryForwardFees` is stored only; fee carry-forward is later work.
 */
export const RolloverRunInputSchema = z
  .strictObject({
    institutionId: IdSchema,
    fromAcademicYearId: IdSchema,
    toAcademicYearId: IdSchema,
    carryForwardFees: z.boolean(),
  })
  .refine((run) => run.toAcademicYearId !== run.fromAcademicYearId, {
    message: "toAcademicYearId must differ from fromAcademicYearId",
    path: ["toAcademicYearId"],
  });
export type RolloverRunInput = z.infer<typeof RolloverRunInputSchema>;

/** Overrides one promotion decision while the run's dry run is ready (M86, D84). */
export const PromotionDecisionInputSchema = z
  .strictObject({
    action: PromotionActionSchema,
    toClassGroupId: IdSchema.nullable(),
    reasonKey: MessageKeySchema.nullable(),
  })
  .refine((d) => (d.toClassGroupId !== null) === needsTargetClassGroup(d.action), {
    message: "toClassGroupId must be set iff action is promote or detain",
    path: ["toClassGroupId"],
  });
export type PromotionDecisionInput = z.infer<typeof PromotionDecisionInputSchema>;
