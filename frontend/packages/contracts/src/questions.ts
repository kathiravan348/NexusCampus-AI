import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import { IdSchema, LocaleSchema, NameSchema, UtcDateTimeSchema } from "./common";

/**
 * M33 question bank (NEX-247, D87): QTI-shaped items in banks. Online tests, attempts, responses and item statistics
 * are in `online-tests.ts`.
 *
 * Server checks (not expressible per record): items and pools come from banks of the tenant; only `approved` items
 * appear in a test; an `ai_generated` item is approved only by a person (A-4); scores are at most the item's points;
 * a learner's attempts never exceed `attemptsAllowed`; the answer key never reaches a learner before results are shown.
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

export const QuestionBankSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    /** Null = shared by every institution of the group. */
    institutionId: IdSchema.nullable(),
    code: AcademicCodeSchema,
    name: NameSchema,
    subjectIds: uniqueIds(20),
    editorStaffProfileIds: uniqueIds(20).min(1),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type QuestionBank = z.infer<typeof QuestionBankSchema>;

export const QuestionKindSchema = z.enum([
  "single_choice",
  "multiple_choice",
  "true_false",
  "short_text",
  "numeric",
  "essay",
  "order",
]);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

/** Option ids are short, stable keys used in responses and statistics. */
export const QuestionOptionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

export const QuestionOptionSchema = z.strictObject({
  id: QuestionOptionIdSchema,
  text: z.string().trim().min(1).max(2000),
  correct: z.boolean(),
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

export const QuestionDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type QuestionDifficulty = z.infer<typeof QuestionDifficultySchema>;

export const QuestionStatusSchema = z.enum(["draft", "in_review", "approved", "retired"]);
export type QuestionStatus = z.infer<typeof QuestionStatusSchema>;

export const QuestionSourceSchema = z.enum(["manual", "ai_generated"]);
export type QuestionSource = z.infer<typeof QuestionSourceSchema>;

/** Allowed [min, max] number of options, and of correct options, per kind. */
const optionRange: Record<QuestionKind, readonly [number, number]> = {
  single_choice: [2, 10],
  multiple_choice: [2, 10],
  order: [2, 10],
  true_false: [2, 2],
  short_text: [0, 0],
  numeric: [0, 0],
  essay: [0, 0],
};
const correctRange: Record<QuestionKind, readonly [number, number]> = {
  ...optionRange,
  single_choice: [1, 1],
  multiple_choice: [1, 10],
  true_false: [1, 1],
  order: [0, 0],
};
const inRange = ([min, max]: readonly [number, number], value: number) =>
  value >= min && value <= max;

export const QuestionItemSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    bankId: IdSchema,
    kind: QuestionKindSchema,
    stem: z.string().trim().min(1).max(10000),
    language: LocaleSchema,
    /** For `order` the options are listed in the correct order; delivery shuffles them. */
    options: z.array(QuestionOptionSchema).max(10),
    /** Set (1–20) exactly for `short_text`. */
    acceptedAnswers: z.array(z.string().trim().min(1).max(200)).max(20),
    /** Set exactly for `numeric`. */
    numericAnswer: z.strictObject({ value: z.number(), tolerance: z.number().min(0) }).nullable(),
    maxPoints: z.number().min(0.5).max(100).multipleOf(0.5),
    difficulty: QuestionDifficultySchema.nullable(),
    outcomeIds: uniqueIds(20),
    /** QTI 3 item identifier for import / export. */
    qtiIdentifier: z.string().trim().min(1).max(200).nullable(),
    explanation: z.string().trim().max(5000).nullable(),
    source: QuestionSourceSchema,
    status: QuestionStatusSchema,
    version: z.int().min(1),
    createdByProfileId: IdSchema,
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine((item) => isUnique(item.options.map((option) => option.id)), {
    message: "option ids must be unique",
    path: ["options"],
  })
  .refine((item) => inRange(optionRange[item.kind], item.options.length), {
    message: "wrong number of options for this kind",
    path: ["options"],
  })
  .refine(
    (item) =>
      inRange(correctRange[item.kind], item.options.filter((option) => option.correct).length),
    { message: "wrong number of correct options for this kind", path: ["options"] },
  )
  .refine((item) => (item.kind === "short_text") === item.acceptedAnswers.length > 0, {
    message: "acceptedAnswers are set exactly for short_text",
    path: ["acceptedAnswers"],
  })
  .refine((item) => (item.kind === "numeric") === (item.numericAnswer !== null), {
    message: "numericAnswer is set exactly for numeric",
    path: ["numericAnswer"],
  });
export type QuestionItem = z.infer<typeof QuestionItemSchema>;
