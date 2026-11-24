import { z } from "zod";
import { IdSchema, IsoDateSchema, RetentionStateSchema, UtcDateTimeSchema } from "./common";
import { CustomFieldValuesSchema } from "./forms";

const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

export const LearnerStatusSchema = z.enum([
  "enrolled",
  "on_leave",
  "withdrawn",
  "transferred_out",
  "graduated",
  "alumni",
]);
export type LearnerStatus = z.infer<typeof LearnerStatusSchema>;

export const HealthFlagKindSchema = z.enum([
  "allergy",
  "medication",
  "condition",
  "dietary",
  "accessibility",
  "other",
]);
export type HealthFlagKind = z.infer<typeof HealthFlagKindSchema>;

export const HealthFlagSchema = z.strictObject({
  kind: HealthFlagKindSchema,
  label: z.string().trim().min(1).max(120),
  note: z.string().max(500).nullable(),
});
export type HealthFlag = z.infer<typeof HealthFlagSchema>;

/**
 * Institution learner record linked to a Person and its learner RoleProfile (D25).
 * Health flags and sensitive custom fields are personal data (V-7). Keep them out of logs
 * and only make them available offline to permitted roles.
 */
export const LearnerSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    campusId: IdSchema.nullable(),
    personId: IdSchema,
    roleProfileId: IdSchema,
    learnerNumber: z.string().trim().min(1).max(40),
    admissionDate: IsoDateSchema,
    status: LearnerStatusSchema,
    leftOn: IsoDateSchema.nullable(),
    healthFlags: z.array(HealthFlagSchema).max(20),
    customFields: CustomFieldValuesSchema,
    retentionState: RetentionStateSchema,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine(
    (record) =>
      (record.leftOn === null) === (record.status === "enrolled" || record.status === "on_leave"),
    {
      message:
        "leftOn must be set for withdrawn, transferred out, graduated and alumni learners only",
      path: ["leftOn"],
    },
  )
  .refine((learner) => learner.leftOn === null || learner.leftOn >= learner.admissionDate, {
    message: "leftOn is before admissionDate",
    path: ["leftOn"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Learner = z.infer<typeof LearnerSchema>;

export const EnrolmentStatusSchema = z.enum(["active", "completed", "withdrawn"]);
export type EnrolmentStatus = z.infer<typeof EnrolmentStatusSchema>;

/** A learner's placement in a class group for an academic year and effective date range. */
export const EnrolmentSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    academicYearId: IdSchema,
    programId: IdSchema,
    yearLevelId: IdSchema.nullable(),
    classGroupId: IdSchema,
    rollNumber: z.string().trim().min(1).max(20).nullable(),
    status: EnrolmentStatusSchema,
    effectiveFrom: IsoDateSchema,
    effectiveTo: IsoDateSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((enrolment) => enrolment.status === "active" || enrolment.effectiveTo !== null, {
    message: "effectiveTo is required for completed and withdrawn enrolments",
    path: ["effectiveTo"],
  })
  .refine((entry) => entry.effectiveTo === null || entry.effectiveTo >= entry.effectiveFrom, {
    message: "effectiveTo is before effectiveFrom",
    path: ["effectiveTo"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Enrolment = z.infer<typeof EnrolmentSchema>;

export const LearnerDocumentKindSchema = z.enum([
  "birth_certificate",
  "id_proof",
  "transfer_certificate",
  "photo",
  "medical",
  "previous_report",
  "other",
]);
export type LearnerDocumentKind = z.infer<typeof LearnerDocumentKindSchema>;

export const LearnerDocumentContentTypeSchema = z.enum([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export type LearnerDocumentContentType = z.infer<typeof LearnerDocumentContentTypeSchema>;

/** Metadata for a learner document. The file itself is stored encrypted. */
export const LearnerDocumentSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    kind: LearnerDocumentKindSchema,
    fileName: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (name) => {
          const trimmed = name.trim();
          return (
            trimmed.length > 0 &&
            trimmed !== "." &&
            trimmed !== ".." &&
            !/[/:\\]/.test(name) &&
            [...name].every((character) => character.charCodeAt(0) >= 32)
          );
        },
        { message: "fileName must be a plain file name" },
      ),
    contentType: LearnerDocumentContentTypeSchema,
    sizeBytes: z.int().min(1).max(20_000_000),
    verified: z.boolean(),
    verifiedByStaffProfileId: IdSchema.nullable(),
    uploadedAt: UtcDateTimeSchema,
  })
  .refine((document) => document.verified === (document.verifiedByStaffProfileId !== null), {
    message: "verifiedByStaffProfileId is set exactly when verified is true",
    path: ["verifiedByStaffProfileId"],
  });
export type LearnerDocument = z.infer<typeof LearnerDocumentSchema>;
