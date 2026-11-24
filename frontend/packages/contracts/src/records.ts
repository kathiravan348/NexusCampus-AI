import { z } from "zod";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";

export const ReportCardStatusSchema = z.enum(["draft", "approved", "published", "withdrawn"]);
export type ReportCardStatus = z.infer<typeof ReportCardStatusSchema>;

export const ReportCardStatusInputSchema = z.strictObject({
  status: z.enum(["approved", "published", "withdrawn"]),
});
export type ReportCardStatusInput = z.infer<typeof ReportCardStatusInputSchema>;

const ReportCardLineSchema = z.strictObject({
  subjectId: IdSchema,
  grade: z.string().trim().min(1).max(8),
  marksPercent: z.number().min(0).max(100).nullable(),
  /** Personal data (V-7). */
  remark: z.string().max(300).nullable(),
});

export const ReportCardSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    academicYearId: IdSchema,
    periodId: IdSchema.nullable(),
    templateId: IdSchema,
    lines: z.array(ReportCardLineSchema).min(1).max(60),
    /** Personal data (V-7). */
    overallRemark: z.string().max(1000).nullable(),
    status: ReportCardStatusSchema,
    publishedAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((report) => (report.status === "published") === (report.publishedAt !== null), {
    message: "publishedAt is set exactly when status is published",
    path: ["publishedAt"],
  })
  .refine((report) => Date.parse(report.updatedAt) >= Date.parse(report.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type ReportCard = z.infer<typeof ReportCardSchema>;

export const IssuedDocumentKindSchema = z.enum([
  "bonafide",
  "transfer",
  "completion",
  "character",
  "transcript",
  "letter",
  "other",
]);
export type IssuedDocumentKind = z.infer<typeof IssuedDocumentKindSchema>;

export const SignatureMethodSchema = z.enum(["drawn", "digital_certificate", "otp"]);
export type SignatureMethod = z.infer<typeof SignatureMethodSchema>;

const DocumentSignatureSchema = z.strictObject({
  staffProfileId: IdSchema,
  signedAt: UtcDateTimeSchema,
  method: SignatureMethodSchema,
});

const RevocationReasonSchema = z.string().trim().min(1).max(300);

export const IssuedDocumentRevokeInputSchema = z.strictObject({ reason: RevocationReasonSchema });
export type IssuedDocumentRevokeInput = z.infer<typeof IssuedDocumentRevokeInputSchema>;

/**
 * The public verification page shows only kind, number, issue date and validity (V-7).
 * Personal data is never displayed there.
 */
const IssuedDocumentBaseSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  /** Null for staff letters. */
  learnerId: IdSchema.nullable(),
  kind: IssuedDocumentKindSchema,
  number: z.string().trim().min(1).max(40),
  templateId: IdSchema,
  issuedOn: IsoDateSchema,
  signatures: z.array(DocumentSignatureSchema).max(5),
  verificationCode: z.string().regex(/^[A-Z0-9]{10,16}$/),
  revoked: z.boolean(),
  /** Internal only; never shown on the public verification page (V-7). */
  revokedReason: RevocationReasonSchema.nullable(),
});

export const IssuedDocumentSchema = IssuedDocumentBaseSchema.refine(
  (document) => document.revoked === (document.revokedReason !== null),
  { message: "revokedReason is set exactly when revoked is true", path: ["revokedReason"] },
);
export type IssuedDocument = z.infer<typeof IssuedDocumentSchema>;

export const IssuedDocumentReadSchema = IssuedDocumentBaseSchema.refine(
  (document) => document.revokedReason === null || document.revoked,
  { message: "A reason requires a revoked document", path: ["revokedReason"] },
);
export type IssuedDocumentRead = z.infer<typeof IssuedDocumentReadSchema>;
