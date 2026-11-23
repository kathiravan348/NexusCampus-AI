import { z } from "zod";
import { IdSchema, NameSchema, UtcDateTimeSchema } from "./common";

/** Academic codes are unique per institution (checked by the server). */
export const AcademicCodeSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/);
export type AcademicCode = z.infer<typeof AcademicCodeSchema>;

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

export const ProgramKindSchema = z.enum([
  "early_years",
  "school_stage",
  "degree",
  "diploma",
  "certificate",
  "course",
  "batch_program",
]);
export type ProgramKind = z.infer<typeof ProgramKindSchema>;

export const ProgramSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    code: AcademicCodeSchema,
    name: NameSchema,
    kind: ProgramKindSchema,
    /** Null for a rolling course. */
    durationYears: z.int().min(1).max(10).nullable(),
    active: z.boolean(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Program = z.infer<typeof ProgramSchema>;

/** A grade, year or semester level within a program. */
export const YearLevelSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  programId: IdSchema,
  code: AcademicCodeSchema,
  name: NameSchema,
  order: z.int().min(1),
});
export type YearLevel = z.infer<typeof YearLevelSchema>;

export const ClassGroupKindSchema = z.enum(["section", "batch", "cohort", "group"]);
export type ClassGroupKind = z.infer<typeof ClassGroupKindSchema>;

/** The server checks that the year level, when set, belongs to the program. */
export const ClassGroupSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    campusId: IdSchema.nullable(),
    /** AcademicCalendar id. */
    academicYearId: IdSchema,
    programId: IdSchema,
    /** A batch can run without a year level. */
    yearLevelId: IdSchema.nullable(),
    kind: ClassGroupKindSchema,
    code: AcademicCodeSchema,
    name: NameSchema,
    capacity: z.int().min(1).max(2000).nullable(),
    homeroomStaffProfileId: IdSchema.nullable(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type ClassGroup = z.infer<typeof ClassGroupSchema>;

export const SubjectKindSchema = z.enum([
  "core",
  "elective",
  "language",
  "activity",
  "lab",
  "project",
]);
export type SubjectKind = z.infer<typeof SubjectKindSchema>;

export const SubjectSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    code: AcademicCodeSchema,
    name: NameSchema,
    kind: SubjectKindSchema,
    credits: z.number().min(0).max(60).multipleOf(0.5).nullable(),
    active: z.boolean(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Subject = z.infer<typeof SubjectSchema>;

/** A subject taught to one class group. The server checks that the period belongs to the academic year. */
export const SubjectOfferingSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    /** AcademicCalendar id. */
    academicYearId: IdSchema,
    /** AcademicPeriod id, or null for the whole year. */
    periodId: IdSchema.nullable(),
    classGroupId: IdSchema,
    subjectId: IdSchema,
    staffProfileIds: z.array(IdSchema).max(10),
    weeklyPeriods: z.int().min(0).max(60).nullable(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine(
    (offering) => new Set(offering.staffProfileIds).size === offering.staffProfileIds.length,
    {
      message: "staffProfileIds has duplicates",
      path: ["staffProfileIds"],
    },
  );
export type SubjectOffering = z.infer<typeof SubjectOfferingSchema>;
