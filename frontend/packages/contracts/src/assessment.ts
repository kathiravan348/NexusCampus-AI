import { z } from "zod";
import { IdSchema, IsoDateSchema, NameSchema, UtcDateTimeSchema } from "./common";

const timestamps = { createdAt: UtcDateTimeSchema, updatedAt: UtcDateTimeSchema };
const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

const PercentSchema = z.number().min(0).max(100);
const RubricCodeSchema = z.string().trim().min(1).max(20);

export const GradeBandSchema = z
  .strictObject({
    code: z.string().trim().min(1).max(8),
    label: z.string().trim().min(1).max(40),
    minPercent: PercentSchema,
    maxPercent: PercentSchema,
    gradePoint: z.number().min(0).max(10).multipleOf(0.1).nullable(),
  })
  .refine((band) => band.minPercent <= band.maxPercent, {
    message: "maxPercent is below minPercent",
    path: ["maxPercent"],
  });
export type GradeBand = z.infer<typeof GradeBandSchema>;

export const GradingSchemeKindSchema = z.enum([
  "percent",
  "letter",
  "gpa",
  "descriptor",
  "competency",
]);
export type GradingSchemeKind = z.infer<typeof GradingSchemeKindSchema>;

/** Bands include their minimum and exclude their maximum, except the final band includes 100. */
export const GradingSchemeSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    name: NameSchema,
    kind: GradingSchemeKindSchema,
    bands: z.array(GradeBandSchema).min(1).max(20),
    ...timestamps,
  })
  .refine(
    ({ bands }) => {
      const ordered = [...bands].sort(
        (a, b) => a.minPercent - b.minPercent || a.maxPercent - b.maxPercent,
      );
      return (
        ordered[ordered.length - 1]?.maxPercent === 100 &&
        ordered.every((band, index) => band.minPercent === (ordered[index - 1]?.maxPercent ?? 0))
      );
    },
    {
      message: "Grade bands must cover 0 to 100 without gaps or overlaps",
      path: ["bands"],
    },
  )
  .refine(validTimestampOrder, timestampOrderIssue);
export type GradingScheme = z.infer<typeof GradingSchemeSchema>;

export const AssessmentKindSchema = z.enum([
  "test",
  "assignment",
  "project",
  "practical",
  "oral",
  "observation",
]);
export type AssessmentKind = z.infer<typeof AssessmentKindSchema>;

export const AssessmentStatusSchema = z.enum([
  "draft",
  "open",
  "marking",
  "moderated",
  "published",
]);
export type AssessmentStatus = z.infer<typeof AssessmentStatusSchema>;

export const AssessmentSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    subjectOfferingId: IdSchema,
    name: NameSchema,
    kind: AssessmentKindSchema,
    maxMarks: z.number().min(1).max(1000).multipleOf(0.5),
    weightPercent: PercentSchema,
    rubricId: IdSchema.nullable(),
    dueOn: IsoDateSchema.nullable(),
    status: AssessmentStatusSchema,
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Assessment = z.infer<typeof AssessmentSchema>;

const RubricLevelSchema = z.strictObject({
  score: z.int().min(0).max(10),
  descriptor: z.string().trim().min(1).max(200),
});

const RubricCriterionSchema = z.strictObject({
  code: RubricCodeSchema,
  label: NameSchema,
  levels: z.array(RubricLevelSchema).min(2).max(6),
});

export const RubricSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  name: NameSchema,
  criteria: z.array(RubricCriterionSchema).min(1).max(20),
});
export type Rubric = z.infer<typeof RubricSchema>;

export const MarkEntrySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    assessmentId: IdSchema,
    learnerId: IdSchema,
    /** The server checks this against the assessment's maximum. */
    marks: z.number().min(0).multipleOf(0.5).nullable(),
    absent: z.boolean(),
    rubricScores: z.record(RubricCodeSchema, z.int()).nullable(),
    /** Personal data (V-7). */
    remark: z.string().max(500).nullable(),
    enteredByStaffProfileId: IdSchema,
    enteredAt: UtcDateTimeSchema,
    /** Device that recorded the mark offline (L2). */
    deviceId: IdSchema.nullable(),
  })
  .refine((entry) => !entry.absent || entry.marks === null, {
    message: "marks must be null for an absent learner",
    path: ["marks"],
  });
export type MarkEntry = z.infer<typeof MarkEntrySchema>;
