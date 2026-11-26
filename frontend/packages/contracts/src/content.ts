import { z } from "zod";
import { IdSchema, LocaleSchema, UtcDateTimeSchema } from "./common";

/**
 * M31 content authoring studio (NEX-212, D87): interactive lessons, media and SCORM 1.2 / 2004, xAPI and cmi5 packages.
 *
 * Server checks (not expressible per record): assets belong to the tenant and match the block or item kind (an image
 * block points to an `image` asset, a package to a `package` asset, captions to `captions` assets); a package's
 * manifest is parsed on upload and its launch path exists inside it; content drafted with AI (`aiAssisted`) is
 * published only by a person. Files are never addressed by storage key or URL in a contract: they are fetched through
 * a signed endpoint in the build step.
 */

const timestamps = {
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
};
const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const httpsUrl = z.url({ protocol: /^https$/ });

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

export const ContentAssetKindSchema = z.enum([
  "image",
  "video",
  "audio",
  "document",
  "package",
  "captions",
]);
export type ContentAssetKind = z.infer<typeof ContentAssetKindSchema>;

/** Metadata of an uploaded teaching file; no storage key or URL. */
export const ContentAssetSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  kind: ContentAssetKindSchema,
  fileName: PlainFileNameSchema,
  contentType: z.string().trim().min(1).max(100),
  sizeBytes: z.int().min(1).max(2_000_000_000),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: UtcDateTimeSchema,
});
export type ContentAsset = z.infer<typeof ContentAssetSchema>;

export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), markdown: z.string().min(1).max(20000) }),
  z.strictObject({
    type: z.literal("image"),
    assetId: IdSchema,
    /** Required: every image needs a text alternative (WCAG 2.2 AA). */
    altText: z.string().trim().min(1).max(500),
  }),
  z.strictObject({
    type: z.literal("video"),
    assetId: IdSchema,
    captionAssetIds: z.array(IdSchema).max(10).refine(isUnique, { message: "ids must be unique" }),
  }),
  z.strictObject({ type: z.literal("question"), questionId: IdSchema }),
  z.strictObject({ type: z.literal("embed"), url: httpsUrl }),
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export const AccessibilityIssueCodeSchema = z.enum([
  "missing_alt_text",
  "missing_captions",
  "low_contrast",
  "heading_order",
  "missing_transcript",
]);
export type AccessibilityIssueCode = z.infer<typeof AccessibilityIssueCodeSchema>;

export const AccessibilityIssueSchema = z.strictObject({
  code: AccessibilityIssueCodeSchema,
  /** Index into `blocks`, or null for the whole item. */
  blockIndex: z.int().min(0).nullable(),
  severity: z.enum(["error", "warning"]),
});
export type AccessibilityIssue = z.infer<typeof AccessibilityIssueSchema>;

export const AccessibilityCheckSchema = z.strictObject({
  checkedAt: UtcDateTimeSchema,
  issues: z.array(AccessibilityIssueSchema).max(200),
});
export type AccessibilityCheck = z.infer<typeof AccessibilityCheckSchema>;

export const ContentKindSchema = z.enum([
  "lesson",
  "video",
  "audio",
  "document",
  "scorm12",
  "scorm2004",
  "xapi",
  "cmi5",
]);
export type ContentKind = z.infer<typeof ContentKindSchema>;

export const ContentStatusSchema = z.enum(["draft", "in_review", "published", "archived"]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

/** A relative path inside the package: no leading `/`, no `..` segment, no scheme, no backslash. */
const LaunchPathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) &&
      path.split("/").every((segment) => segment !== ".."),
    { message: "launchPath must be a relative path inside the package" },
  );

export const ContentPackageSchema = z.strictObject({
  assetId: IdSchema,
  launchPath: LaunchPathSchema,
  manifestIdentifier: z.string().trim().min(1).max(200),
});
export type ContentPackage = z.infer<typeof ContentPackageSchema>;

const mediaKinds: ReadonlySet<ContentKind> = new Set(["video", "audio", "document"]);
const packageKinds: ReadonlySet<ContentKind> = new Set(["scorm12", "scorm2004", "xapi", "cmi5"]);

export const ContentItemSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    kind: ContentKindSchema,
    title: z.string().trim().min(1).max(200),
    language: LocaleSchema,
    outcomeIds: z.array(IdSchema).max(20).refine(isUnique, { message: "ids must be unique" }),
    status: ContentStatusSchema,
    version: z.int().min(1),
    /** Set exactly for a lesson. */
    blocks: z.array(ContentBlockSchema).min(1).max(200).nullable(),
    /** Set exactly for video, audio and document items. */
    assetId: IdSchema.nullable(),
    /** Set exactly for SCORM, xAPI and cmi5 items. */
    package: ContentPackageSchema.nullable(),
    durationSeconds: z.int().min(0).nullable(),
    /** Drafted with the AI helper; labelled as AI and published only by a person. */
    aiAssisted: z.boolean(),
    accessibility: AccessibilityCheckSchema.nullable(),
    createdByProfileId: IdSchema,
    ...timestamps,
  })
  .refine((item) => Date.parse(item.updatedAt) >= Date.parse(item.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine((item) => (item.kind === "lesson") === (item.blocks !== null), {
    message: "blocks are set exactly for a lesson",
    path: ["blocks"],
  })
  .refine((item) => mediaKinds.has(item.kind) === (item.assetId !== null), {
    message: "assetId is set exactly for video, audio and document items",
    path: ["assetId"],
  })
  .refine((item) => packageKinds.has(item.kind) === (item.package !== null), {
    message: "package is set exactly for SCORM, xAPI and cmi5 items",
    path: ["package"],
  })
  .refine(
    (item) =>
      item.status !== "published" ||
      (item.accessibility !== null &&
        item.accessibility.issues.every((issue) => issue.severity !== "error")),
    {
      message: "published content needs an accessibility check without errors",
      path: ["accessibility"],
    },
  );
export type ContentItem = z.infer<typeof ContentItemSchema>;

export const ContentAttemptStatusSchema = z.enum(["incomplete", "completed", "passed", "failed"]);
export type ContentAttemptStatus = z.infer<typeof ContentAttemptStatusSchema>;

/** One learner's attempt at a content item; raw xAPI statements stay server-side. */
export const ContentAttemptSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    contentItemId: IdSchema,
    learnerId: IdSchema,
    /** xAPI / cmi5 registration. */
    registration: z.uuid(),
    status: ContentAttemptStatusSchema,
    scoreBps: z.int().min(0).max(10000).nullable(),
    timeSpentSeconds: z.int().min(0),
    startedAt: UtcDateTimeSchema,
    finishedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((attempt) => (attempt.status === "incomplete") === (attempt.finishedAt === null), {
    message: "finishedAt is set exactly when the attempt is finished",
    path: ["finishedAt"],
  })
  .refine(
    (attempt) =>
      attempt.finishedAt === null ||
      Date.parse(attempt.finishedAt) >= Date.parse(attempt.startedAt),
    { message: "finishedAt is before startedAt", path: ["finishedAt"] },
  );
export type ContentAttempt = z.infer<typeof ContentAttemptSchema>;
