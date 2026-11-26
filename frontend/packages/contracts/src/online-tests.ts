import { z } from "zod";
import { IdSchema, UtcDateTimeSchema } from "./common";
import { QuestionOptionIdSchema } from "./questions";

/**
 * M33 online tests (NEX-247, D87): practice / graded / adaptive tests from the question bank, attempts (practice
 * offline at L2 through the outbox), auto- and manual marking, classical item analysis.
 *
 * Server checks (not expressible per record): items and pools come from banks of the tenant; only `approved` items
 * appear in a test; scores are at most the item's points; a learner's attempts never exceed `attemptsAllowed`; the
 * answer key never reaches a learner before results are shown.
 */

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
const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const uniqueIds = (max: number) =>
  z.array(IdSchema).max(max).refine(isUnique, { message: "ids must be unique" });
const HalfStepScoreSchema = z.number().min(0).multipleOf(0.5);

export const TestPoolSchema = z.strictObject({
  bankIds: uniqueIds(10).min(1),
  outcomeIds: uniqueIds(20),
  itemCount: z.int().min(1).max(100),
});
export type TestPool = z.infer<typeof TestPoolSchema>;

/** A section lists fixed items or draws from a pool — exactly one of the two. */
export const TestSectionSchema = z
  .strictObject({
    id: IdSchema,
    title: z.string().trim().min(1).max(200),
    itemIds: uniqueIds(200),
    pool: TestPoolSchema.nullable(),
  })
  .refine((section) => section.itemIds.length > 0 !== (section.pool !== null), {
    message: "a section has fixed items or a pool, not both",
    path: ["pool"],
  });
export type TestSection = z.infer<typeof TestSectionSchema>;

export const OnlineTestModeSchema = z.enum(["practice", "graded", "adaptive"]);
export type OnlineTestMode = z.infer<typeof OnlineTestModeSchema>;

export const OnlineTestStatusSchema = z.enum(["draft", "scheduled", "open", "closed", "archived"]);
export type OnlineTestStatus = z.infer<typeof OnlineTestStatusSchema>;

export const ShowResultsSchema = z.enum(["immediately", "after_close", "manual"]);
export type ShowResults = z.infer<typeof ShowResultsSchema>;

export const OnlineTestSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    courseSpaceId: IdSchema.nullable(),
    /** M20 assessment that receives released scores; null = not in the gradebook. */
    assessmentId: IdSchema.nullable(),
    title: z.string().trim().min(1).max(200),
    mode: OnlineTestModeSchema,
    sections: z.array(TestSectionSchema).min(1).max(20),
    timeLimitMinutes: z.int().min(1).max(600).nullable(),
    opensAt: UtcDateTimeSchema,
    closesAt: UtcDateTimeSchema,
    /** Null = unlimited, practice tests only. */
    attemptsAllowed: z.int().min(1).max(10).nullable(),
    shuffleOptions: z.boolean(),
    showResults: ShowResultsSchema,
    passMarkBps: z.int().min(1).max(10000).nullable(),
    /** Proctoring (M34) applies to graded and adaptive tests only. */
    proctored: z.boolean(),
    status: OnlineTestStatusSchema,
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine((test) => isUnique(test.sections.map((section) => section.id)), {
    message: "section ids must be unique",
    path: ["sections"],
  })
  .refine((test) => Date.parse(test.closesAt) > Date.parse(test.opensAt), {
    message: "closesAt must be after opensAt",
    path: ["closesAt"],
  })
  .refine((test) => test.attemptsAllowed !== null || test.mode === "practice", {
    message: "only a practice test allows unlimited attempts",
    path: ["attemptsAllowed"],
  })
  .refine((test) => !test.proctored || test.mode !== "practice", {
    message: "a practice test is never proctored",
    path: ["proctored"],
  })
  .refine(
    (test) => test.mode !== "adaptive" || test.sections.every((section) => section.pool !== null),
    {
      message: "an adaptive test draws every section from a pool",
      path: ["sections"],
    },
  );
export type OnlineTest = z.infer<typeof OnlineTestSchema>;

export const TestAttemptStatusSchema = z.enum([
  "in_progress",
  "submitted",
  "auto_submitted",
  "marked",
  "released",
]);
export type TestAttemptStatus = z.infer<typeof TestAttemptStatusSchema>;

export const TestAttemptSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    testId: IdSchema,
    learnerId: IdSchema,
    attemptNumber: z.int().min(1),
    status: TestAttemptStatusSchema,
    startedAt: UtcDateTimeSchema,
    submittedAt: UtcDateTimeSchema.nullable(),
    scorePoints: HalfStepScoreSchema.nullable(),
    maxPoints: z.number().min(0.5).multipleOf(0.5),
    /** Offline outbox client id (L2 practice). */
    clientId: z.uuid(),
    deviceId: IdSchema.nullable(),
  })
  .refine((attempt) => (attempt.status === "in_progress") === (attempt.submittedAt === null), {
    message: "submittedAt is set exactly when the attempt is no longer in progress",
    path: ["submittedAt"],
  })
  .refine(
    (attempt) =>
      attempt.submittedAt === null ||
      Date.parse(attempt.submittedAt) >= Date.parse(attempt.startedAt),
    { message: "submittedAt is before startedAt", path: ["submittedAt"] },
  )
  .refine(
    (attempt) => {
      if (attempt.status === "in_progress") return attempt.scorePoints === null;
      if (attempt.status === "marked" || attempt.status === "released")
        return attempt.scorePoints !== null;
      return true;
    },
    {
      message: "a marked or released attempt has a score; one in progress has none",
      path: ["scorePoints"],
    },
  )
  .refine((attempt) => attempt.scorePoints === null || attempt.scorePoints <= attempt.maxPoints, {
    message: "scorePoints is more than maxPoints",
    path: ["scorePoints"],
  });
export type TestAttempt = z.infer<typeof TestAttemptSchema>;

export const TestResponseSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    attemptId: IdSchema,
    itemId: IdSchema,
    /** Chosen options; for an `order` item, the learner's order of all option ids. */
    selectedOptionIds: z
      .array(QuestionOptionIdSchema)
      .max(10)
      .refine(isUnique, { message: "ids must be unique" }),
    /** Personal data (V-7). */
    textAnswer: z.string().max(20000).nullable(),
    numericAnswer: z.number().nullable(),
    autoScore: HalfStepScoreSchema.nullable(),
    manualScore: HalfStepScoreSchema.nullable(),
    markedByStaffProfileId: IdSchema.nullable(),
    /** The learner's own "review later" flag. */
    flagged: z.boolean(),
    answeredAt: UtcDateTimeSchema,
  })
  .refine(
    (response) => (response.manualScore !== null) === (response.markedByStaffProfileId !== null),
    {
      message: "markedByStaffProfileId is set exactly when there is a manual score",
      path: ["markedByStaffProfileId"],
    },
  );
export type TestResponse = z.infer<typeof TestResponseSchema>;

/** Classical item analysis: facility (share answering correctly) and discrimination (point-biserial). */
export const ItemStatisticSchema = z.strictObject({
  tenantId: IdSchema,
  itemId: IdSchema,
  /** Null = across all tests. */
  testId: IdSchema.nullable(),
  responses: z.int().min(0),
  facilityBps: z.int().min(0).max(10000),
  discrimination: z.number().min(-1).max(1).nullable(),
  optionCounts: z.record(QuestionOptionIdSchema, z.int().min(0)),
  computedAt: UtcDateTimeSchema,
});
export type ItemStatistic = z.infer<typeof ItemStatisticSchema>;
