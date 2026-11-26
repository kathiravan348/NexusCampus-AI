import { z } from "zod";
import { CapabilityTierSchema } from "./ai";
import { IdSchema, IsoDateSchema, LocaleSchema, UtcDateTimeSchema } from "./common";

/**
 * M36 live classes (NEX-249, D87): provider-neutral sessions (Zoom, Meet, Teams, BigBlueButton or the demo provider),
 * joins that can suggest attendance, recordings with a deletion date and AI summaries a teacher publishes.
 *
 * No contract carries a join link, meeting password or provider secret: joining goes through an endpoint that returns
 * a short-lived link; provider keys live in settings / OpenBao (D19–D20). Server checks: the provider is configured for
 * the tenant, else the feature is hidden; recordings are deleted on `deleteOn`; learners whose guardians opted out of
 * media (M91) are not recorded on camera; summaries need the tenant AI switch; join minutes only suggest M17 marks —
 * a teacher submits the roll; joins from another tenant are rejected.
 */

const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);

export const LiveSessionStatusSchema = z.enum(["scheduled", "live", "ended", "cancelled"]);
export type LiveSessionStatus = z.infer<typeof LiveSessionStatusSchema>;

export const LiveSessionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    courseSpaceId: IdSchema.nullable(),
    timetableSlotId: IdSchema.nullable(),
    title: z.string().trim().min(1).max(200),
    /** Settings key of the provider, never a secret. */
    provider: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
    externalMeetingId: z.string().trim().min(1).max(200).nullable(),
    scheduledStart: UtcDateTimeSchema,
    scheduledEnd: UtcDateTimeSchema,
    hostStaffProfileIds: z
      .array(IdSchema)
      .min(1)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length, { message: "ids must be unique" }),
    status: LiveSessionStatusSchema,
    actualStart: UtcDateTimeSchema.nullable(),
    actualEnd: UtcDateTimeSchema.nullable(),
    recordingEnabled: z.boolean(),
    attendanceFromJoins: z.boolean(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((session) => isNotBefore(session.updatedAt, session.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine((session) => Date.parse(session.scheduledEnd) > Date.parse(session.scheduledStart), {
    message: "scheduledEnd must be after scheduledStart",
    path: ["scheduledEnd"],
  })
  .refine(
    (session) =>
      (session.status === "live" || session.status === "ended") === (session.actualStart !== null),
    {
      message: "actualStart is set exactly when the session is live or ended",
      path: ["actualStart"],
    },
  )
  .refine((session) => (session.status === "ended") === (session.actualEnd !== null), {
    message: "actualEnd is set exactly when the session has ended",
    path: ["actualEnd"],
  })
  .refine(
    (session) =>
      session.actualStart === null ||
      session.actualEnd === null ||
      isNotBefore(session.actualEnd, session.actualStart),
    { message: "actualEnd is before actualStart", path: ["actualEnd"] },
  );
export type LiveSession = z.infer<typeof LiveSessionSchema>;

/** One person's time in a session; personal data. */
export const LiveJoinSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    sessionId: IdSchema,
    profileId: IdSchema,
    role: z.enum(["host", "participant"]),
    joinedAt: UtcDateTimeSchema,
    leftAt: UtcDateTimeSchema.nullable(),
    durationSeconds: z.int().min(0),
  })
  .refine((join) => join.leftAt === null || isNotBefore(join.leftAt, join.joinedAt), {
    message: "leftAt is before joinedAt",
    path: ["leftAt"],
  });
export type LiveJoin = z.infer<typeof LiveJoinSchema>;

export const LiveRecordingStatusSchema = z.enum(["processing", "ready", "failed", "deleted"]);
export type LiveRecordingStatus = z.infer<typeof LiveRecordingStatusSchema>;

/** Metadata of a recording; personal data, no storage key or URL. */
export const LiveRecordingSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  sessionId: IdSchema,
  status: LiveRecordingStatusSchema,
  durationSeconds: z.int().min(0).nullable(),
  sizeBytes: z.int().min(1).nullable(),
  deleteOn: IsoDateSchema,
  visibleToLearners: z.boolean(),
  /** Participants are always told that the session is recorded. */
  noticeShownToParticipants: z.literal(true),
  createdAt: UtcDateTimeSchema,
});
export type LiveRecording = z.infer<typeof LiveRecordingSchema>;

export const LiveChapterSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  startSeconds: z.int().min(0),
});
export type LiveChapter = z.infer<typeof LiveChapterSchema>;

/** An AI summary with chapters; learners see it only after a teacher publishes it. */
export const LiveSummarySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    sessionId: IdSchema,
    recordingId: IdSchema,
    aiGenerated: z.literal(true),
    tier: CapabilityTierSchema,
    language: LocaleSchema,
    summary: z.string().trim().min(1).max(5000),
    chapters: z.array(LiveChapterSchema).max(50),
    status: z.enum(["draft", "published"]),
    publishedByStaffProfileId: IdSchema.nullable(),
    publishedAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine(
    (summary) =>
      summary.chapters.every(
        (chapter, index, all) =>
          index === 0 || (all[index - 1]?.startSeconds ?? -1) < chapter.startSeconds,
      ),
    { message: "chapters start in strictly ascending order", path: ["chapters"] },
  )
  .refine(
    (summary) =>
      (summary.status === "published") === (summary.publishedByStaffProfileId !== null) &&
      (summary.status === "published") === (summary.publishedAt !== null),
    {
      message: "a person and a time are recorded exactly when the summary is published",
      path: ["publishedByStaffProfileId"],
    },
  )
  .refine(
    (summary) =>
      summary.publishedAt === null || isNotBefore(summary.publishedAt, summary.createdAt),
    {
      message: "publishedAt is before createdAt",
      path: ["publishedAt"],
    },
  );
export type LiveSummary = z.infer<typeof LiveSummarySchema>;
