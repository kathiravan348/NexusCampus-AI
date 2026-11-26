import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import { AssistSourceSchema, CapabilityTierSchema } from "./ai";
import { IdSchema, IsoDateSchema, NameSchema, UtcDateTimeSchema } from "./common";

/**
 * M40 coaching and test prep (NEX-218, D87). A learner sees their own rank; leaderboards show names only with the
 * learner's (a minor's guardian's) consent, otherwise rank numbers alone (G-6). AI doubt answers and weak-topic plans
 * need the tenant AI switch and, for minors, a guardian's `ai_features` consent (A-3); they answer only from the
 * batch's content, are labelled AI and cite sources (A-5); a teacher shares a plan, never the AI (A-4).
 */

const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const HalfStepSchema = z.number().min(0).multipleOf(0.5);

export const TestSeriesSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    code: AcademicCodeSchema,
    name: NameSchema,
    targetExam: z.string().trim().min(1).max(100),
    classGroupIds: z
      .array(IdSchema)
      .min(1)
      .max(50)
      .refine(isUnique, { message: "ids must be unique" }),
    /** M33 online tests, in order. */
    testIds: z.array(IdSchema).min(1).max(100).refine(isUnique, { message: "ids must be unique" }),
    status: z.enum(["draft", "active", "completed"]),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((series) => Date.parse(series.updatedAt) >= Date.parse(series.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type TestSeries = z.infer<typeof TestSeriesSchema>;

export const SectionScoreSchema = z
  .strictObject({
    sectionId: IdSchema,
    scorePoints: HalfStepSchema,
    maxPoints: z.number().min(0.5).multipleOf(0.5),
  })
  .refine((score) => score.scorePoints <= score.maxPoints, {
    message: "scorePoints is more than maxPoints",
    path: ["scorePoints"],
  });
export type SectionScore = z.infer<typeof SectionScoreSchema>;

export const TestRankSchema = z
  .strictObject({
    tenantId: IdSchema,
    seriesId: IdSchema,
    testId: IdSchema,
    learnerId: IdSchema,
    scorePoints: HalfStepSchema,
    maxPoints: z.number().min(0.5).multipleOf(0.5),
    participants: z.int().min(1),
    rank: z.int().min(1),
    percentileBps: z.int().min(0).max(10000),
    sectionScores: z.array(SectionScoreSchema).max(20),
    publishedAt: UtcDateTimeSchema,
  })
  .refine((rank) => rank.scorePoints <= rank.maxPoints, {
    message: "scorePoints is more than maxPoints",
    path: ["scorePoints"],
  })
  .refine((rank) => rank.rank <= rank.participants, {
    message: "rank is above the number of participants",
    path: ["rank"],
  })
  .refine((rank) => isUnique(rank.sectionScores.map((score) => score.sectionId)), {
    message: "section ids must be unique",
    path: ["sectionScores"],
  });
export type TestRank = z.infer<typeof TestRankSchema>;

export const DoubtStatusSchema = z.enum(["open", "ai_answered", "answered", "closed"]);
export type DoubtStatus = z.infer<typeof DoubtStatusSchema>;

export const DoubtSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  learnerId: IdSchema,
  courseSpaceId: IdSchema.nullable(),
  questionItemId: IdSchema.nullable(),
  subjectId: IdSchema.nullable(),
  /** Personal data (V-7). */
  text: z.string().trim().min(1).max(4000),
  attachmentCount: z.int().min(0).max(5),
  status: DoubtStatusSchema,
  /** Offline outbox client id (L2). */
  clientId: z.uuid(),
  deviceId: IdSchema.nullable(),
  createdAt: UtcDateTimeSchema,
});
export type Doubt = z.infer<typeof DoubtSchema>;

export const DoubtAnswerSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    doubtId: IdSchema,
    kind: z.enum(["ai", "staff"]),
    text: z.string().trim().min(1).max(8000),
    aiGenerated: z.boolean(),
    tier: CapabilityTierSchema.nullable(),
    sources: z.array(AssistSourceSchema).max(10),
    answeredByStaffProfileId: IdSchema.nullable(),
    /** A teacher may mark an AI answer as checked. */
    verifiedByStaffProfileId: IdSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine(
    (answer) =>
      answer.kind === "ai"
        ? answer.aiGenerated &&
          answer.tier !== null &&
          answer.sources.length > 0 &&
          answer.answeredByStaffProfileId === null
        : !answer.aiGenerated &&
          answer.tier === null &&
          answer.sources.length === 0 &&
          answer.answeredByStaffProfileId !== null &&
          answer.verifiedByStaffProfileId === null,
    {
      message:
        "an AI answer is labelled, tiered and cited; a staff answer names its author and is not verified",
      path: ["kind"],
    },
  );
export type DoubtAnswer = z.infer<typeof DoubtAnswerSchema>;

export const WeakTopicSchema = z.strictObject({
  outcomeId: IdSchema,
  reason: z.string().trim().min(1).max(300),
  suggestedItemCount: z.int().min(1).max(50),
});
export type WeakTopic = z.infer<typeof WeakTopicSchema>;

export const WeakTopicPlanSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    seriesId: IdSchema,
    aiGenerated: z.literal(true),
    tier: CapabilityTierSchema,
    topics: z.array(WeakTopicSchema).min(1).max(10),
    status: z.enum(["draft", "shared"]),
    sharedByStaffProfileId: IdSchema.nullable(),
    sharedAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine((plan) => isUnique(plan.topics.map((topic) => topic.outcomeId)), {
    message: "one entry per outcome",
    path: ["topics"],
  })
  .refine(
    (plan) =>
      (plan.status === "shared") === (plan.sharedByStaffProfileId !== null) &&
      (plan.status === "shared") === (plan.sharedAt !== null),
    {
      message: "a person and a time are recorded exactly when the plan is shared",
      path: ["sharedByStaffProfileId"],
    },
  );
export type WeakTopicPlan = z.infer<typeof WeakTopicPlanSchema>;

export const ParentReportSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    seriesId: IdSchema,
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
    testsTaken: z.int().min(0),
    averagePercentileBps: z.int().min(0).max(10000).nullable(),
    attendanceBps: z.int().min(0).max(10000).nullable(),
    /** Personal data (V-7). */
    teacherComment: z.string().trim().max(2000).nullable(),
    status: z.enum(["draft", "sent"]),
    sentByStaffProfileId: IdSchema.nullable(),
    sentAt: UtcDateTimeSchema.nullable(),
  })
  .refine((report) => report.periodEnd >= report.periodStart, {
    message: "periodEnd is before periodStart",
    path: ["periodEnd"],
  })
  .refine(
    (report) =>
      (report.status === "sent") === (report.sentByStaffProfileId !== null) &&
      (report.status === "sent") === (report.sentAt !== null),
    {
      message: "a person and a time are recorded exactly when the report is sent",
      path: ["sentByStaffProfileId"],
    },
  );
export type ParentReport = z.infer<typeof ParentReportSchema>;
