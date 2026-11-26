import { z } from "zod";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";

/**
 * M34 online proctoring (NEX-215, D87 rules 1–3). Proctoring that a person decides on: learners accept a notice before
 * they start, identity is checked by a person, recordings carry a deletion date, and flags are signals for review.
 *
 * Rules the server enforces (A-4, V-7, EU AI Act): no emotion, gaze, behaviour or identity inference and no biometric
 * template is ever stored; a flag never changes an attempt, score or record by itself — an upheld flag starts a person's
 * academic-integrity process outside M34; `aiFlagging` needs the tenant AI switch; recordings are deleted on
 * `deleteOn`; a session reaches `in_progress` only after the learner accepted the current notice; provider keys live in
 * settings / OpenBao, never in a contract.
 */

const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);

export const IdentityCheckModeSchema = z.enum(["none", "staff_photo_match", "id_document_view"]);
export type IdentityCheckMode = z.infer<typeof IdentityCheckModeSchema>;

export const RecordingModeSchema = z.enum(["none", "screen", "screen_and_camera"]);
export type RecordingMode = z.infer<typeof RecordingModeSchema>;

export const ProctoringSettingsSchema = z
  .strictObject({
    tenantId: IdSchema,
    testId: IdSchema,
    /** Settings key of the proctoring provider, never a secret. */
    provider: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
    identityCheck: IdentityCheckModeSchema,
    browserLock: z.boolean(),
    recording: RecordingModeSchema,
    /** Set exactly when something is recorded. */
    retentionDays: z.int().min(1).max(365).nullable(),
    aiFlagging: z.boolean(),
    /** Version of the notice learners accept before they start. */
    noticeVersion: z.string().trim().min(1).max(32),
    updatedByStaffProfileId: IdSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((settings) => (settings.recording !== "none") === (settings.retentionDays !== null), {
    message: "retentionDays is set exactly when something is recorded",
    path: ["retentionDays"],
  });
export type ProctoringSettings = z.infer<typeof ProctoringSettingsSchema>;

export const IdentityResultSchema = z.enum(["not_required", "pending", "verified", "not_verified"]);
export type IdentityResult = z.infer<typeof IdentityResultSchema>;

export const ProctoringSessionStatusSchema = z.enum(["waiting", "in_progress", "ended"]);
export type ProctoringSessionStatus = z.infer<typeof ProctoringSessionStatusSchema>;

const isDecided = (result: IdentityResult) => result === "verified" || result === "not_verified";

export const ProctoringSessionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    testId: IdSchema,
    attemptId: IdSchema,
    learnerId: IdSchema,
    status: ProctoringSessionStatusSchema,
    noticeVersion: z.string().trim().min(1).max(32),
    noticeAcceptedAt: UtcDateTimeSchema.nullable(),
    identityResult: IdentityResultSchema,
    /** Always a person — never an automated face match. */
    identityCheckedByStaffProfileId: IdSchema.nullable(),
    identityCheckedAt: UtcDateTimeSchema.nullable(),
    startedAt: UtcDateTimeSchema.nullable(),
    endedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((session) => (session.status !== "waiting") === (session.noticeAcceptedAt !== null), {
    message: "the notice is accepted exactly when the session has started",
    path: ["noticeAcceptedAt"],
  })
  .refine(
    (session) =>
      isDecided(session.identityResult) === (session.identityCheckedByStaffProfileId !== null) &&
      isDecided(session.identityResult) === (session.identityCheckedAt !== null),
    {
      message: "a person and a time are recorded exactly when identity is decided",
      path: ["identityCheckedByStaffProfileId"],
    },
  )
  .refine((session) => (session.status !== "waiting") === (session.startedAt !== null), {
    message: "startedAt is set exactly when the session has started",
    path: ["startedAt"],
  })
  .refine((session) => (session.status === "ended") === (session.endedAt !== null), {
    message: "endedAt is set exactly when the session has ended",
    path: ["endedAt"],
  })
  .refine(
    (session) =>
      session.startedAt === null ||
      session.endedAt === null ||
      isNotBefore(session.endedAt, session.startedAt),
    { message: "endedAt is before startedAt", path: ["endedAt"] },
  );
export type ProctoringSession = z.infer<typeof ProctoringSessionSchema>;

/** Metadata of one recorded segment; personal data, no storage key or URL. */
export const RecordingSegmentSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    sessionId: IdSchema,
    kind: z.enum(["screen", "camera"]),
    startedAt: UtcDateTimeSchema,
    endedAt: UtcDateTimeSchema,
    sizeBytes: z.int().min(1).max(10_000_000_000),
    deleteOn: IsoDateSchema,
  })
  .refine((segment) => Date.parse(segment.endedAt) > Date.parse(segment.startedAt), {
    message: "endedAt must be after startedAt",
    path: ["endedAt"],
  });
export type RecordingSegment = z.infer<typeof RecordingSegmentSchema>;

/** Observable events only — no gaze, emotion, behaviour or identity inference. */
export const ProctoringFlagKindSchema = z.enum([
  "tab_switch",
  "window_blur",
  "copy_paste",
  "device_disconnected",
  "no_person_visible",
  "another_person_visible",
  "other_voices",
  "other",
]);
export type ProctoringFlagKind = z.infer<typeof ProctoringFlagKindSchema>;

export const ProctoringFlagSourceSchema = z.enum(["browser", "ai", "staff"]);
export type ProctoringFlagSource = z.infer<typeof ProctoringFlagSourceSchema>;

export const ProctoringFlagReviewSchema = z.enum(["pending", "dismissed", "upheld"]);
export type ProctoringFlagReview = z.infer<typeof ProctoringFlagReviewSchema>;

/** A signal for a person to review (A-4); it never changes an attempt or score by itself. */
export const ProctoringFlagSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    sessionId: IdSchema,
    kind: ProctoringFlagKindSchema,
    source: ProctoringFlagSourceSchema,
    aiGenerated: z.boolean(),
    /** Set exactly for AI flags. */
    confidenceBps: z.int().min(0).max(10000).nullable(),
    /** Plain words (A-5). */
    reason: z.string().trim().min(1).max(300),
    occurredAt: UtcDateTimeSchema,
    offsetSeconds: z.int().min(0),
    review: ProctoringFlagReviewSchema,
    reviewedByStaffProfileId: IdSchema.nullable(),
    reviewedAt: UtcDateTimeSchema.nullable(),
    reviewNote: z.string().trim().min(1).max(1000).nullable(),
  })
  .refine((flag) => flag.aiGenerated === (flag.source === "ai"), {
    message: "aiGenerated is true exactly for AI flags",
    path: ["aiGenerated"],
  })
  .refine((flag) => (flag.source === "ai") === (flag.confidenceBps !== null), {
    message: "confidenceBps is set exactly for AI flags",
    path: ["confidenceBps"],
  })
  .refine(
    (flag) =>
      (flag.review !== "pending") === (flag.reviewedByStaffProfileId !== null) &&
      (flag.review !== "pending") === (flag.reviewedAt !== null),
    {
      message: "a person and a time are recorded exactly when the flag is reviewed",
      path: ["reviewedByStaffProfileId"],
    },
  )
  .refine((flag) => flag.reviewedAt === null || isNotBefore(flag.reviewedAt, flag.occurredAt), {
    message: "reviewedAt is before occurredAt",
    path: ["reviewedAt"],
  })
  .refine((flag) => flag.review !== "upheld" || flag.reviewNote !== null, {
    message: "an upheld flag needs a note",
    path: ["reviewNote"],
  });
export type ProctoringFlag = z.infer<typeof ProctoringFlagSchema>;
