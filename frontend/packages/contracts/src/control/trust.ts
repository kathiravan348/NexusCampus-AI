import { z } from "zod";
import {
  CountryCodeSchema,
  IdSchema,
  IsoDateSchema,
  NameSchema,
  UtcDateTimeSchema,
} from "../common";
import { hasNoDuplicates, notBefore } from "./shared";

/** A company that processes data for us (P14); published on the trust page. */
export const SubProcessorSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  purpose: z.string().trim().min(1).max(300),
  country: CountryCodeSchema,
  dpaSigned: z.boolean(),
  /** Whether it can ever touch institution data (e.g. the cloud host) or only our business data. */
  touchesInstitutionData: z.boolean(),
});
export type SubProcessor = z.infer<typeof SubProcessorSchema>;

export const CertificationCodeSchema = z.enum(["iso27001", "iso27701", "soc2", "cert_in"]);
export type CertificationCode = z.infer<typeof CertificationCodeSchema>;

export const CertificationSchema = z
  .strictObject({
    id: IdSchema,
    code: CertificationCodeSchema,
    status: z.enum(["planned", "in_audit", "certified", "lapsed"]),
    validUntil: IsoDateSchema.nullable(),
  })
  .refine((c) => (c.status === "certified") === (c.validUntil !== null), {
    message: "validUntil is set iff certified",
    path: ["validUntil"],
  });
export type Certification = z.infer<typeof CertificationSchema>;

export const IncidentSeveritySchema = z.enum(["sev1", "sev2", "sev3", "sev4"]);
export type IncidentSeverity = z.infer<typeof IncidentSeveritySchema>;

/**
 * A security incident (P14). When personal data may be affected, the breach-notification clock runs (e.g. 72 h
 * under GDPR, 6 h to CERT-In): `breachNotificationDueAt` is set and must be met by `notifiedAt`.
 */
export const SecurityIncidentSchema = z
  .strictObject({
    id: IdSchema,
    title: z.string().trim().min(1).max(200),
    severity: IncidentSeveritySchema,
    status: z.enum(["investigating", "contained", "resolved", "post_mortem_done"]),
    affectedAccountIds: z.array(IdSchema),
    personalDataAffected: z.boolean(),
    detectedAt: UtcDateTimeSchema,
    breachNotificationDueAt: UtcDateTimeSchema.nullable(),
    notifiedAt: UtcDateTimeSchema.nullable(),
    /** Incident report drafted by AI for a security officer to edit (P14). */
    reportAiDrafted: z.boolean(),
  })
  .refine((i) => hasNoDuplicates(i.affectedAccountIds), {
    message: "affectedAccountIds has duplicates",
    path: ["affectedAccountIds"],
  })
  .refine((i) => i.personalDataAffected === (i.breachNotificationDueAt !== null), {
    message: "breachNotificationDueAt is set iff personal data may be affected",
    path: ["breachNotificationDueAt"],
  })
  .refine(
    (i) => i.breachNotificationDueAt === null || notBefore(i.detectedAt, i.breachNotificationDueAt),
    { message: "the deadline is after detection", path: ["breachNotificationDueAt"] },
  )
  .refine((i) => i.notifiedAt === null || i.personalDataAffected, {
    message: "notifiedAt only applies to a breach",
    path: ["notifiedAt"],
  });
export type SecurityIncident = z.infer<typeof SecurityIncidentSchema>;

/** A signed data-processing agreement with a customer. */
export const DpaRecordSchema = z.strictObject({
  id: IdSchema,
  accountId: IdSchema,
  version: z.string().regex(/^\d+\.\d+$/),
  signedAt: UtcDateTimeSchema,
});
export type DpaRecord = z.infer<typeof DpaRecordSchema>;
