import { z } from "zod";
import { CapabilityTierSchema } from "./ai";
import { IdSchema, UtcDateTimeSchema } from "./common";

/**
 * M44 surveys and feedback (NEX-252, D87). Anonymity holds end to end (G-6, V-7): the server never stores who answered
 * an anonymous survey (a separate "has answered" marker only prevents repeats) and an anonymous response carries no
 * person or device and only the day it was submitted (an exact time could identify someone in a small class); the
 * server drops its outbox client id once the retry window has passed; confidential responses are seen only by the survey owner; results for groups smaller than
 * `minResponsesToShow` are suppressed; AI theme summaries quote no one and are made only from at least
 * `minResponsesToShow` responses. Faculty results reach the staff member and their managers, and AI sentiment about a
 * named person is never the sole basis for an appraisal (M50, A-4).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const uniqueIds = (max: number) =>
  z.array(IdSchema).max(max).refine(isUnique, { message: "ids must be unique" });
const prompt = z.string().trim().min(1).max(500);
const options = z
  .array(z.string().trim().min(1).max(200))
  .min(2)
  .max(10)
  .refine(isUnique, { message: "options must be unique" });

export const SurveyQuestionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("rating"),
    id: IdSchema,
    prompt,
    required: z.boolean(),
    scaleMax: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]),
  }),
  z.strictObject({
    type: z.literal("single_choice"),
    id: IdSchema,
    prompt,
    required: z.boolean(),
    options,
  }),
  z.strictObject({
    type: z.literal("multiple_choice"),
    id: IdSchema,
    prompt,
    required: z.boolean(),
    options,
  }),
  z.strictObject({
    type: z.literal("text"),
    id: IdSchema,
    prompt,
    required: z.boolean(),
    maxLength: z.int().min(1).max(2000),
  }),
]);
export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

export const SurveyKindSchema = z.enum([
  "course_feedback",
  "faculty_feedback",
  "parent",
  "staff",
  "general",
]);
export type SurveyKind = z.infer<typeof SurveyKindSchema>;

export const AnonymitySchema = z.enum(["anonymous", "confidential", "named"]);
export type Anonymity = z.infer<typeof AnonymitySchema>;

export const SurveySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    title: z.string().trim().min(1).max(200),
    kind: SurveyKindSchema,
    audience: z.enum(["learners", "guardians", "staff"]),
    targetClassGroupIds: uniqueIds(50),
    targetCourseSpaceIds: uniqueIds(50),
    /** The staff member a faculty survey is about; set exactly for faculty feedback. */
    subjectStaffProfileId: IdSchema.nullable(),
    anonymity: AnonymitySchema,
    minResponsesToShow: z.int().min(3).max(50),
    opensAt: UtcDateTimeSchema,
    closesAt: UtcDateTimeSchema,
    status: z.enum(["draft", "open", "closed", "archived"]),
    questions: z.array(SurveyQuestionSchema).min(1).max(50),
    createdByStaffProfileId: IdSchema,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((survey) => Date.parse(survey.updatedAt) >= Date.parse(survey.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine(
    (survey) => (survey.kind === "faculty_feedback") === (survey.subjectStaffProfileId !== null),
    {
      message: "subjectStaffProfileId is set exactly for faculty feedback",
      path: ["subjectStaffProfileId"],
    },
  )
  .refine((survey) => survey.anonymity === "named" || survey.minResponsesToShow >= 5, {
    message: "an anonymous or confidential survey shows results only from 5 responses up",
    path: ["minResponsesToShow"],
  })
  .refine((survey) => Date.parse(survey.closesAt) > Date.parse(survey.opensAt), {
    message: "closesAt must be after opensAt",
    path: ["closesAt"],
  })
  .refine((survey) => isUnique(survey.questions.map((question) => question.id)), {
    message: "question ids must be unique",
    path: ["questions"],
  });
export type Survey = z.infer<typeof SurveySchema>;

/** Exactly one of `rating`, `optionIndexes` (non-empty) or `text` is filled. */
export const SurveyAnswerSchema = z
  .strictObject({
    questionId: IdSchema,
    rating: z.int().min(1).nullable(),
    optionIndexes: z
      .array(z.int().min(0))
      .max(10)
      .refine(isUnique, { message: "indexes must be unique" }),
    /** Personal data unless the survey is anonymous. */
    text: z.string().trim().max(2000).nullable(),
  })
  .refine(
    (answer) =>
      [answer.rating !== null, answer.optionIndexes.length > 0, answer.text !== null].filter(
        Boolean,
      ).length === 1,
    { message: "an answer fills exactly one of rating, options or text", path: ["questionId"] },
  );
export type SurveyAnswer = z.infer<typeof SurveyAnswerSchema>;

export const SurveyResponseSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    surveyId: IdSchema,
    respondentProfileId: IdSchema.nullable(),
    anonymous: z.boolean(),
    answers: z.array(SurveyAnswerSchema).min(1).max(50),
    submittedAt: UtcDateTimeSchema,
    /** Offline outbox client id (L2). */
    clientId: z.uuid(),
    deviceId: IdSchema.nullable(),
  })
  .refine((response) => response.anonymous === (response.respondentProfileId === null), {
    message: "a response names its respondent exactly when it is not anonymous",
    path: ["respondentProfileId"],
  })
  .refine((response) => !response.anonymous || response.deviceId === null, {
    message: "an anonymous response carries no device",
    path: ["deviceId"],
  })
  .refine((response) => !response.anonymous || Date.parse(response.submittedAt) % DAY_MS === 0, {
    message: "an anonymous response keeps only the day it was submitted",
    path: ["submittedAt"],
  })
  .refine((response) => isUnique(response.answers.map((answer) => answer.questionId)), {
    message: "one answer per question",
    path: ["answers"],
  });
export type SurveyResponse = z.infer<typeof SurveyResponseSchema>;

export const QuestionResultSchema = z
  .strictObject({
    surveyId: IdSchema,
    questionId: IdSchema,
    minResponsesToShow: z.int().min(3).max(50),
    responseCount: z.int().min(0),
    suppressed: z.boolean(),
    distribution: z.record(z.string().min(1).max(20), z.int().min(0)).nullable(),
    average: z.number().min(0).nullable(),
  })
  .refine((result) => result.suppressed === result.responseCount < result.minResponsesToShow, {
    message: "suppressed is true exactly when there are too few responses",
    path: ["suppressed"],
  })
  .refine(
    (result) => !result.suppressed || (result.distribution === null && result.average === null),
    {
      message: "a suppressed result shows no numbers",
      path: ["distribution"],
    },
  )
  .refine((result) => result.suppressed || result.distribution !== null, {
    message: "a shown result has a distribution",
    path: ["distribution"],
  });
export type QuestionResult = z.infer<typeof QuestionResultSchema>;

export const SurveyThemeSchema = z.strictObject({
  label: z.string().trim().min(1).max(100),
  mentionCount: z.int().min(1),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
});
export type SurveyTheme = z.infer<typeof SurveyThemeSchema>;

/** An AI summary of free-text answers — themes only, never quotes. */
export const ThemeSummarySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    surveyId: IdSchema,
    questionId: IdSchema.nullable(),
    aiGenerated: z.literal(true),
    tier: CapabilityTierSchema,
    themes: z.array(SurveyThemeSchema).min(1).max(20),
    summary: z.string().trim().min(1).max(3000),
    basedOnResponses: z.int().min(1),
    status: z.enum(["draft", "published"]),
    publishedByStaffProfileId: IdSchema.nullable(),
    publishedAt: UtcDateTimeSchema.nullable(),
  })
  .refine(
    (summary) =>
      (summary.status === "published") === (summary.publishedByStaffProfileId !== null) &&
      (summary.status === "published") === (summary.publishedAt !== null),
    {
      message: "a person and a time are recorded exactly when the summary is published",
      path: ["publishedByStaffProfileId"],
    },
  );
export type ThemeSummary = z.infer<typeof ThemeSummarySchema>;
