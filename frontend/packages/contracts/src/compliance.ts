import { z } from "zod";
import { IdSchema, ModuleIdSchema, RegionSchema, UtcDateTimeSchema } from "./common";

const notBefore = (from: string, to: string) => Date.parse(to) >= Date.parse(from);

/** `<module>.<entity>.<action>`, same shape as `DomainEvent.eventType` (e.g. `m02.user.invited`). */
const ACTION = /^[mp]\d{2}(\.[a-z][a-zA-Z0-9]*){2,}$/;

/** Who acted: a tenant user, the system, or provider staff under an approved access grant (V-3). */
export const AuditActorKindSchema = z.enum(["user", "system", "provider_grant"]);
export type AuditActorKind = z.infer<typeof AuditActorKindSchema>;

/**
 * One entry of the append-only, hash-chained audit log (E-3, D25). Values are never carried here — only
 * the names of changed fields — so erasure keeps the chain valid. `hash` covers ids, metadata and
 * `prevHash`; the first entry of a chain has `prevHash: null`.
 */
export const AuditEventSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    occurredAt: UtcDateTimeSchema,
    actorKind: AuditActorKindSchema,
    /** User id for `user`; provider staff reference for `provider_grant`; null for `system`. */
    actorId: IdSchema.nullable(),
    grantId: IdSchema.nullable(),
    action: z.string().regex(ACTION, {
      message: "Must be <module>.<entity>.<action>, e.g. m02.user.invited",
    }),
    moduleId: ModuleIdSchema,
    targetType: z.string().regex(/^[a-z][a-zA-Z0-9]*$/, { message: "Must be camelCase" }),
    targetId: IdSchema.nullable(),
    deviceId: IdSchema.nullable(),
    changes: z.array(
      z.strictObject({
        field: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/, {
          message: "Must be a field path, e.g. person.phone",
        }),
        sensitive: z.boolean(),
      }),
    ),
    prevHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    hash: z.string().regex(/^[0-9a-f]{64}$/, { message: "Must be a SHA-256 hex digest" }),
  })
  .refine((e) => (e.grantId !== null) === (e.actorKind === "provider_grant"), {
    message: "grantId is required for provider_grant actors and must be null otherwise",
    path: ["grantId"],
  })
  .refine((e) => (e.actorId === null) === (e.actorKind === "system"), {
    message: "actorId must be null for system events and set otherwise",
    path: ["actorId"],
  })
  .refine((e) => e.action.startsWith(`${e.moduleId.toLowerCase()}.`), {
    message: "action must start with its moduleId",
    path: ["action"],
  });
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const ConsentPurposeSchema = z.enum([
  "ai_features",
  "media_sharing",
  "marketing",
  "data_processing",
]);
export type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

export const ConsentStatusSchema = z.enum(["granted", "withdrawn", "pending"]);
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;

export const ConsentMethodSchema = z.enum(["form", "digital_signature", "in_app", "paper"]);
export type ConsentMethod = z.infer<typeof ConsentMethodSchema>;

/** Consent of a person for one purpose (G-6). For minors `givenByPersonId` is the guardian. */
export const ConsentSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    personId: IdSchema,
    purpose: ConsentPurposeSchema,
    status: ConsentStatusSchema,
    givenByPersonId: IdSchema.nullable(),
    method: ConsentMethodSchema,
    recordedAt: UtcDateTimeSchema,
    withdrawnAt: UtcDateTimeSchema.nullable(),
  })
  .refine((c) => (c.withdrawnAt !== null) === (c.status === "withdrawn"), {
    message: "withdrawnAt is set exactly when status is withdrawn",
    path: ["withdrawnAt"],
  })
  .refine((c) => c.withdrawnAt === null || notBefore(c.recordedAt, c.withdrawnAt), {
    message: "withdrawnAt is before recordedAt",
    path: ["withdrawnAt"],
  });
export type Consent = z.infer<typeof ConsentSchema>;

export const DsrKindSchema = z.enum(["access", "correct", "delete", "export"]);
export type DsrKind = z.infer<typeof DsrKindSchema>;

export const DsrStatusSchema = z.enum(["received", "in_progress", "completed", "rejected"]);
export type DsrStatus = z.infer<typeof DsrStatusSchema>;

/** A data subject request (E-3, G-6). `completedAt` is set once the request is completed or rejected. */
export const DataSubjectRequestSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    personId: IdSchema,
    kind: DsrKindSchema,
    status: DsrStatusSchema,
    receivedAt: UtcDateTimeSchema,
    dueAt: UtcDateTimeSchema,
    completedAt: UtcDateTimeSchema.nullable(),
    handledBy: IdSchema.nullable(),
  })
  .refine((r) => Date.parse(r.dueAt) > Date.parse(r.receivedAt), {
    message: "dueAt must be after receivedAt",
    path: ["dueAt"],
  })
  .refine(
    (r) => (r.completedAt !== null) === (r.status === "completed" || r.status === "rejected"),
    { message: "completedAt is set exactly when the request is closed", path: ["completedAt"] },
  )
  .refine((r) => r.completedAt === null || notBefore(r.receivedAt, r.completedAt), {
    message: "completedAt is before receivedAt",
    path: ["completedAt"],
  });
export type DataSubjectRequest = z.infer<typeof DataSubjectRequestSchema>;

export const CompliancePackCodeSchema = z.enum([
  "gdpr",
  "uk_gdpr",
  "ferpa",
  "coppa",
  "dpdp",
  "lgpd",
  "popia",
  "pdpa",
  "eu_ai_act",
]);
export type CompliancePackCode = z.infer<typeof CompliancePackCodeSchema>;

/** Regional rules a tenant follows (G-6): request deadlines, minors' age, guardian consent, retention. */
export const CompliancePackSchema = z.strictObject({
  code: CompliancePackCodeSchema,
  region: RegionSchema,
  dsrDueDays: z.int().min(1).max(90),
  minorAgeThreshold: z.int().min(13).max(21),
  guardianConsentForAi: z.boolean(),
  guardianConsentForMedia: z.boolean(),
  retentionDaysDefault: z.int().min(1),
});
export type CompliancePack = z.infer<typeof CompliancePackSchema>;
