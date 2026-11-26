import { z } from "zod";
import { CapabilityTierSchema } from "./ai";
import { IdSchema, UtcDateTimeSchema } from "./common";

/**
 * M91 media, portfolios and learning evidence (NEX-251, D87 rule 4).
 *
 * Rules the server enforces (G-6, A-3, V-7): `consentState` is computed from every tagged learner's media consent —
 * `cleared` only when all are `allowed` — and recomputed when a consent changes, so a withdrawal hides the item from
 * families at once; people are tagged by hand, never by face recognition, and untagged faces are the uploader's duty;
 * AI captions and outcome suggestions need the tenant AI switch and never identify people; exports drop or blur media
 * that shows other tagged learners; files are fetched through a signed endpoint — no key or URL in any contract.
 */

const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const uniqueIds = (max: number) =>
  z.array(IdSchema).max(max).refine(isUnique, { message: "ids must be unique" });
const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);

/** Same rule as a learner document's file name: no path separators, no `.` / `..`, no control characters. */
const PlainFileNameSchema = z
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
  );

export const MediaConsentStatusSchema = z.enum(["allowed", "opted_out", "pending"]);
export type MediaConsentStatus = z.infer<typeof MediaConsentStatusSchema>;

export const LearnerMediaConsentSchema = z
  .strictObject({
    tenantId: IdSchema,
    learnerId: IdSchema,
    status: MediaConsentStatusSchema,
    /** Consent with purpose `media_sharing`; set unless pending. */
    consentId: IdSchema.nullable(),
    updatedAt: UtcDateTimeSchema,
  })
  .refine((consent) => (consent.status !== "pending") === (consent.consentId !== null), {
    message: "consentId is set exactly when the guardian has answered",
    path: ["consentId"],
  });
export type LearnerMediaConsent = z.infer<typeof LearnerMediaConsentSchema>;

export const MediaVisibilitySchema = z.enum(["staff_only", "tagged_families", "class_families"]);
export type MediaVisibility = z.infer<typeof MediaVisibilitySchema>;

export const MediaConsentStateSchema = z.enum(["cleared", "blocked", "pending"]);
export type MediaConsentState = z.infer<typeof MediaConsentStateSchema>;

export const MediaItemSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    kind: z.enum(["photo", "video", "audio", "document"]),
    fileName: PlainFileNameSchema,
    contentType: z.string().trim().min(1).max(100),
    sizeBytes: z.int().min(1).max(2_000_000_000),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    capturedAt: UtcDateTimeSchema,
    uploadedByProfileId: IdSchema,
    /** Tagged by a person. */
    taggedLearnerIds: uniqueIds(30),
    visibility: MediaVisibilitySchema,
    consentState: MediaConsentStateSchema,
    caption: z.string().trim().max(500).nullable(),
    /** Labelled as AI. */
    aiCaption: z
      .strictObject({ text: z.string().trim().min(1).max(500), tier: CapabilityTierSchema })
      .nullable(),
    outcomeIds: uniqueIds(10),
    aiSuggestedOutcomeIds: uniqueIds(10),
    status: z.enum(["active", "archived", "deleted"]),
    createdAt: UtcDateTimeSchema,
  })
  .refine((item) => item.visibility === "staff_only" || item.consentState === "cleared", {
    message: "only cleared media is shared beyond staff",
    path: ["visibility"],
  });
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const PortfolioSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    title: z.string().trim().min(1).max(200),
    visibility: z.enum(["learner_and_family", "staff_only"]),
    status: z.enum(["open", "archived"]),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((portfolio) => isNotBefore(portfolio.updatedAt, portfolio.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type Portfolio = z.infer<typeof PortfolioSchema>;

export const PortfolioEntryKindSchema = z.enum([
  "media",
  "observation",
  "assignment_submission",
  "credential",
  "reflection",
]);
export type PortfolioEntryKind = z.infer<typeof PortfolioEntryKindSchema>;

export const PortfolioEntrySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    portfolioId: IdSchema,
    kind: PortfolioEntryKindSchema,
    /** The evidence record; null exactly for a reflection. */
    refId: IdSchema.nullable(),
    /** Set exactly for a reflection; personal data (V-7). */
    reflection: z.string().trim().min(1).max(4000).nullable(),
    outcomeIds: uniqueIds(10),
    addedByProfileId: IdSchema,
    addedByRole: z.enum(["learner", "guardian", "staff"]),
    addedAt: UtcDateTimeSchema,
  })
  .refine((entry) => (entry.kind === "reflection") === (entry.refId === null), {
    message: "refId is null exactly for a reflection",
    path: ["refId"],
  })
  .refine((entry) => (entry.kind === "reflection") === (entry.reflection !== null), {
    message: "reflection text is set exactly for a reflection",
    path: ["reflection"],
  });
export type PortfolioEntry = z.infer<typeof PortfolioEntrySchema>;

export const PortfolioExportStatusSchema = z.enum(["queued", "ready", "failed", "expired"]);
export type PortfolioExportStatus = z.infer<typeof PortfolioExportStatusSchema>;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** A portable export of one learner's portfolio; downloaded through a signed endpoint, never by URL in the contract. */
export const PortfolioExportSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    portfolioId: IdSchema,
    format: z.enum(["pdf", "zip"]),
    status: PortfolioExportStatusSchema,
    requestedByProfileId: IdSchema,
    requestedAt: UtcDateTimeSchema,
    readyAt: UtcDateTimeSchema.nullable(),
    expiresAt: UtcDateTimeSchema.nullable(),
    otherLearnersExcluded: z.literal(true),
  })
  .refine(
    (file) =>
      (file.status === "ready" || file.status === "expired") === (file.readyAt !== null) &&
      (file.status === "ready" || file.status === "expired") === (file.expiresAt !== null),
    {
      message: "readyAt and expiresAt are set exactly when the export was produced",
      path: ["readyAt"],
    },
  )
  .refine((file) => file.readyAt === null || isNotBefore(file.readyAt, file.requestedAt), {
    message: "readyAt is before requestedAt",
    path: ["readyAt"],
  })
  .refine(
    (file) =>
      file.readyAt === null ||
      file.expiresAt === null ||
      (Date.parse(file.expiresAt) > Date.parse(file.readyAt) &&
        Date.parse(file.expiresAt) - Date.parse(file.readyAt) <= SEVEN_DAYS_MS),
    { message: "an export expires after it is ready and within 7 days", path: ["expiresAt"] },
  );
export type PortfolioExport = z.infer<typeof PortfolioExportSchema>;
