import { z } from "zod";
import { AssistSourceSchema, CapabilityTierSchema } from "./ai";
import { IdSchema, LocaleSchema, UtcDateTimeSchema } from "./common";

/**
 * M35 AI tutor and learning paths (NEX-214, D87): mastery per outcome, learning paths, and a guard-railed tutor per
 * course space — always labelled AI, citing its sources (A-5), answering in the learner's language (A-6).
 *
 * Server checks (not expressible per record): a minor's consent is `granted`, current, for purpose `ai_features` and
 * given by a guardian of the learner (A-3, G-6); the tutor is off when the tenant AI switch or the space's tutor is off;
 * it reads only through the API with the learner's own rights (A-2) and only from `sourceContentIds` and the space's
 * outcomes; health (M61) and safeguarding (M62) records never reach it (A-3); the daily message limit holds; a step's
 * `refId` points to a record of the step's kind; a blocked answer shows a safe message and flags the session.
 */

const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);

export const MasteryLevelSchema = z.enum([
  "not_started",
  "emerging",
  "developing",
  "secure",
  "mastered",
]);
export type MasteryLevel = z.infer<typeof MasteryLevelSchema>;

export const MasteryRecordSchema = z
  .strictObject({
    tenantId: IdSchema,
    learnerId: IdSchema,
    outcomeId: IdSchema,
    level: MasteryLevelSchema,
    scoreBps: z.int().min(0).max(10000),
    evidenceCount: z.int().min(0),
    lastEvidenceAt: UtcDateTimeSchema.nullable(),
    updatedAt: UtcDateTimeSchema,
  })
  .refine((record) => (record.level === "not_started") === (record.evidenceCount === 0), {
    message: "a record is not_started exactly when it has no evidence",
    path: ["level"],
  })
  .refine(
    (record) =>
      record.evidenceCount > 0 || (record.scoreBps === 0 && record.lastEvidenceAt === null),
    { message: "a record without evidence has no score or evidence time", path: ["scoreBps"] },
  )
  .refine((record) => record.evidenceCount === 0 || record.lastEvidenceAt !== null, {
    message: "a record with evidence has a last evidence time",
    path: ["lastEvidenceAt"],
  });
export type MasteryRecord = z.infer<typeof MasteryRecordSchema>;

export const LearningPathStepKindSchema = z.enum([
  "content",
  "test",
  "practice",
  "assignment",
  "live_session",
]);
export type LearningPathStepKind = z.infer<typeof LearningPathStepKindSchema>;

export const LearningPathStepStatusSchema = z.enum(["locked", "available", "done", "skipped"]);
export type LearningPathStepStatus = z.infer<typeof LearningPathStepStatusSchema>;

export const LearningPathStepSchema = z.strictObject({
  id: IdSchema,
  order: z.int().min(1),
  kind: LearningPathStepKindSchema,
  refId: IdSchema,
  outcomeId: IdSchema.nullable(),
  status: LearningPathStepStatusSchema,
  /** Why the step is suggested, in plain words (A-5). */
  reason: z.string().trim().min(1).max(300),
});
export type LearningPathStep = z.infer<typeof LearningPathStepSchema>;

export const LearningPathSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    courseSpaceId: IdSchema,
    source: z.enum(["teacher", "adaptive"]),
    /** Set exactly for a teacher-assigned path. */
    assignedByStaffProfileId: IdSchema.nullable(),
    status: z.enum(["active", "paused", "completed"]),
    steps: z.array(LearningPathStepSchema).min(1).max(100),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((path) => isNotBefore(path.updatedAt, path.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine((path) => (path.source === "teacher") === (path.assignedByStaffProfileId !== null), {
    message: "assignedByStaffProfileId is set exactly for a teacher-assigned path",
    path: ["assignedByStaffProfileId"],
  })
  .refine((path) => isUnique(path.steps.map((step) => step.id)), {
    message: "step ids must be unique",
    path: ["steps"],
  })
  .refine((path) => isUnique(path.steps.map((step) => step.order)), {
    message: "step orders must be unique",
    path: ["steps"],
  });
export type LearningPath = z.infer<typeof LearningPathSchema>;

export const TutorModeSchema = z.enum(["hints_only", "explain", "socratic"]);
export type TutorMode = z.infer<typeof TutorModeSchema>;

/** Chooses the guard-rail profile (vocabulary, topics, refusal rules). */
export const TutorAudienceSchema = z.enum(["children", "teens", "adults"]);
export type TutorAudience = z.infer<typeof TutorAudienceSchema>;

export const TutorSettingsSchema = z.strictObject({
  tenantId: IdSchema,
  courseSpaceId: IdSchema,
  enabled: z.boolean(),
  mode: TutorModeSchema,
  audience: TutorAudienceSchema,
  /** The tutor answers only from these content items and the space's outcomes. */
  sourceContentIds: z.array(IdSchema).max(200).refine(isUnique, { message: "ids must be unique" }),
  dailyMessageLimit: z.int().min(1).max(200),
  /** Shown to learners before they start a session. */
  transcriptsVisibleToStaff: z.boolean(),
  updatedByStaffProfileId: IdSchema,
  updatedAt: UtcDateTimeSchema,
});
export type TutorSettings = z.infer<typeof TutorSettingsSchema>;

export const TutorSessionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    courseSpaceId: IdSchema,
    learnerIsMinor: z.boolean(),
    /** The guardian's `ai_features` consent; required for a minor (A-3). */
    consentId: IdSchema.nullable(),
    status: z.enum(["open", "closed"]),
    startedAt: UtcDateTimeSchema,
    endedAt: UtcDateTimeSchema.nullable(),
    messageCount: z.int().min(0),
    /**
     * The visibility the learner was shown when the session started. Staff read this session's messages only when it
     * is true — a later settings change never opens older transcripts; a safety-blocked answer is the exception the
     * notice names (designated reviewers see the flagged exchange).
     */
    transcriptsVisibleToStaff: z.boolean(),
    flaggedForReview: z.boolean(),
  })
  .refine((session) => !session.learnerIsMinor || session.consentId !== null, {
    message: "a minor's session needs a guardian's consent",
    path: ["consentId"],
  })
  .refine((session) => (session.status === "closed") === (session.endedAt !== null), {
    message: "endedAt is set exactly when the session is closed",
    path: ["endedAt"],
  })
  .refine(
    (session) => session.endedAt === null || isNotBefore(session.endedAt, session.startedAt),
    {
      message: "endedAt is before startedAt",
      path: ["endedAt"],
    },
  );
export type TutorSession = z.infer<typeof TutorSessionSchema>;

export const TutorSafetyCategorySchema = z.enum([
  "self_harm",
  "violence",
  "sexual",
  "personal_data",
  "off_topic",
  "academic_integrity",
]);
export type TutorSafetyCategory = z.infer<typeof TutorSafetyCategorySchema>;

const messageBase = {
  id: IdSchema,
  tenantId: IdSchema,
  sessionId: IdSchema,
  createdAt: UtcDateTimeSchema,
};

const LearnerMessageSchema = z.strictObject({
  ...messageBase,
  role: z.literal("learner"),
  /** Personal data (V-7). */
  text: z.string().trim().min(1).max(4000),
});

const TutorAnswerSchema = z.strictObject({
  ...messageBase,
  role: z.literal("tutor"),
  text: z.string().trim().min(1).max(8000),
  aiGenerated: z.literal(true),
  tier: CapabilityTierSchema,
  sources: z.array(AssistSourceSchema).max(10),
  locale: LocaleSchema,
  blocked: z.boolean(),
  safetyCategory: TutorSafetyCategorySchema.nullable(),
  feedback: z.enum(["helpful", "not_helpful"]).nullable(),
});

export const TutorMessageSchema = z
  .discriminatedUnion("role", [LearnerMessageSchema, TutorAnswerSchema])
  .refine(
    (message) =>
      message.role === "learner" || message.blocked === (message.safetyCategory !== null),
    {
      message: "safetyCategory is set exactly when the answer is blocked",
      path: ["safetyCategory"],
    },
  )
  .refine(
    (message) => message.role === "learner" || message.blocked || message.sources.length > 0,
    {
      message: "an answer cites at least one source (A-5)",
      path: ["sources"],
    },
  );
export type TutorMessage = z.infer<typeof TutorMessageSchema>;
