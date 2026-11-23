import { z } from "zod";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";
import { LicenceEditionSchema, LicenceStateSchema } from "./control/licence";
import { ReleaseChannelSchema } from "./control/release";
import { SemverSchema } from "./control/shared";

/**
 * Install agent (M84) — runs inside every self-hosted install. It only ever talks outbound to Nexus Control (or not
 * at all when air-gapped, V-6). These contracts are what the institution's admin sees in its own app.
 */

/** What the install knows about its licence, verified offline (D23). Counts only. */
export const LicenceSummarySchema = z
  .strictObject({
    edition: LicenceEditionSchema,
    state: LicenceStateSchema,
    expiresAt: IsoDateSchema.nullable(),
    supportEndsAt: IsoDateSchema,
    learnerCap: z.int().min(1),
    learnersUsed: z.int().min(0),
    campusCap: z.int().min(1),
    campusesUsed: z.int().min(0),
    /** Last day of the grace period when `state` is `grace`. */
    graceEndsAt: IsoDateSchema.nullable(),
  })
  .refine((l) => (l.state === "grace") === (l.graceEndsAt !== null), {
    message: "graceEndsAt is set iff in grace",
    path: ["graceEndsAt"],
  });
export type LicenceSummary = z.infer<typeof LicenceSummarySchema>;

export const InstallStatusSchema = z
  .strictObject({
    installId: IdSchema,
    version: SemverSchema,
    channel: ReleaseChannelSchema,
    licence: LicenceSummarySchema,
    airGapped: z.boolean(),
    /** PII-free health telemetry; the institution can switch it off (ARCHITECTURE §9). */
    telemetryEnabled: z.boolean(),
    lastUpdateCheckAt: UtcDateTimeSchema.nullable(),
    lastBackupAt: UtcDateTimeSchema.nullable(),
  })
  .refine((s) => !s.airGapped || (!s.telemetryEnabled && s.lastUpdateCheckAt === null), {
    message: "an air-gapped install sends no telemetry and checks no updates online",
    path: ["airGapped"],
  });
export type InstallStatus = z.infer<typeof InstallStatusSchema>;

/** An update the install can apply: pulled online or loaded from a signed offline bundle (DM-9). */
export const UpdateOfferSchema = z.strictObject({
  version: SemverSchema,
  channel: ReleaseChannelSchema,
  source: z.enum(["online", "offline_bundle"]),
  signatureValid: z.boolean(),
  securityFix: z.boolean(),
  releaseNotes: z.string().max(5000),
  /** Updates need a support contract in force; the install still runs without one. */
  coveredBySupport: z.boolean(),
});
export type UpdateOffer = z.infer<typeof UpdateOfferSchema>;

/** An encrypted backup or a DM-8 tenant export, made by the install itself. */
export const BackupJobSchema = z
  .strictObject({
    id: IdSchema,
    kind: z.enum(["backup", "tenant_export"]),
    status: z.enum(["running", "done", "failed"]),
    encrypted: z.literal(true),
    sizeBytes: z.int().min(0).nullable(),
    startedAt: UtcDateTimeSchema,
    finishedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((b) => (b.status === "running") === (b.finishedAt === null), {
    message: "finishedAt is set iff the job has finished",
    path: ["finishedAt"],
  })
  .refine((b) => b.status !== "done" || b.sizeBytes !== null, {
    message: "a finished backup has a size",
    path: ["sizeBytes"],
  });
export type BackupJob = z.infer<typeof BackupJobSchema>;

export const DiagnosticBundleStatusSchema = z.enum([
  "generating",
  "ready_for_review",
  "approved",
  "sent",
  "discarded",
]);
export type DiagnosticBundleStatus = z.infer<typeof DiagnosticBundleStatusSchema>;

/**
 * Logs and config for support, with personal data scrubbed, that the institution's admin reviews before sending
 * (V-6). Nothing leaves the install until a person approves it.
 */
export const DiagnosticBundleSchema = z
  .strictObject({
    id: IdSchema,
    status: DiagnosticBundleStatusSchema,
    scrubbed: z.literal(true),
    sizeBytes: z.int().min(0).nullable(),
    /** Support ticket the bundle is for, if any. */
    ticketRef: z.string().max(64).nullable(),
    createdAt: UtcDateTimeSchema,
    reviewedBy: IdSchema.nullable(),
    sentAt: UtcDateTimeSchema.nullable(),
  })
  .refine(
    (b) => {
      if (b.status === "approved" || b.status === "sent") return b.reviewedBy !== null;
      if (b.status === "discarded") return true;
      return b.reviewedBy === null;
    },
    {
      message: "approved and sent bundles name their reviewer; unreviewed ones do not",
      path: ["reviewedBy"],
    },
  )
  .refine((b) => (b.status === "sent") === (b.sentAt !== null), {
    message: "sentAt is set iff sent",
    path: ["sentAt"],
  });
export type DiagnosticBundle = z.infer<typeof DiagnosticBundleSchema>;

/**
 * Exactly the text a support diagnostic bundle would send, for the admin to read before approving or discarding it
 * (V-6, NEX-144). `GET /api/v1/install/diagnostics/:id/content`.
 */
export const DiagnosticContentSchema = z.strictObject({
  id: IdSchema,
  content: z.string(),
});
export type DiagnosticContent = z.infer<typeof DiagnosticContentSchema>;
