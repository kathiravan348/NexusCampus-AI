import { z } from "zod";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";

export const ReportCardStatusSchema = z.enum(["draft", "approved", "published", "withdrawn"]);
export type ReportCardStatus = z.infer<typeof ReportCardStatusSchema>;

const ReportCardLineSchema = z.strictObject({
  subjectId: IdSchema,
  grade: z.string().trim().min(1).max(8),
  marksPercent: z.number().min(0).max(100).nullable(),
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

/**
 * The public verification page shows only kind, number, issue date and validity (V-7).
 * Personal data is never displayed there.
 */
export const IssuedDocumentSchema = z
  .strictObject({
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
    revokedReason: z.string().trim().min(1).nullable(),
  })
  .refine((document) => document.revoked === (document.revokedReason !== null), {
    message: "revokedReason is set exactly when revoked is true",
    path: ["revokedReason"],
  });
export type IssuedDocument = z.infer<typeof IssuedDocumentSchema>;
