import { z } from "zod";
import { CapabilityTierSchema } from "./ai";
import { IdSchema, UtcDateTimeSchema } from "./common";

/**
 * M32 homework and assignments (NEX-213, D87). Submissions are captured offline (L2) through the outbox with a client
 * id; marking is always a person's (an AI marking suggestion stays a suggestion, A-4); originality is a signal for a
 * person, never a verdict.
 *
 * Server checks (not expressible per record): a peer reviewer is neither the author nor a member of the submitting
 * group; rubric codes match the assignment's rubric (M20); marks are at most `maxMarks`; submission kinds are allowed
 * by the assignment; gradebook marks move to the linked M20 assessment only when a person releases feedback.
 */

const timestamps = {
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
};
const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};
const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const uniqueIds = (max: number) =>
  z.array(IdSchema).max(max).refine(isUnique, { message: "ids must be unique" });
const isAfter = (later: string, earlier: string) => Date.parse(later) > Date.parse(earlier);
const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);

/** Same code rule as M20 rubric criteria (`assessment.ts`). */
const RubricScoresSchema = z.record(z.string().trim().min(1).max(20), z.int().min(0).max(10));
const HalfStepMarksSchema = z.number().min(0).multipleOf(0.5);

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

export const SubmissionKindSchema = z.enum(["text", "file", "audio", "photo", "link"]);
export type SubmissionKind = z.infer<typeof SubmissionKindSchema>;

/** Metadata of a submitted file; no storage key or URL. */
export const SubmissionFileSchema = z.strictObject({
  fileName: PlainFileNameSchema,
  contentType: z.string().trim().min(1).max(100),
  sizeBytes: z.int().min(1).max(100_000_000),
});
export type SubmissionFile = z.infer<typeof SubmissionFileSchema>;

export const PeerReviewSettingsSchema = z.strictObject({
  reviewsPerSubmission: z.int().min(1).max(5),
  anonymous: z.boolean(),
  dueAt: UtcDateTimeSchema,
});
export type PeerReviewSettings = z.infer<typeof PeerReviewSettingsSchema>;

export const AssignmentStatusSchema = z.enum(["draft", "published", "closed", "archived"]);
export type AssignmentStatus = z.infer<typeof AssignmentStatusSchema>;

export const AssignmentSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    courseSpaceId: IdSchema,
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().max(10000),
    outcomeIds: uniqueIds(20),
    /** M20 assessment that receives released marks; null = not in the gradebook. */
    assessmentId: IdSchema.nullable(),
    rubricId: IdSchema.nullable(),
    /** Null = feedback only, no marks. */
    maxMarks: z.number().min(1).max(1000).multipleOf(0.5).nullable(),
    submissionKinds: z
      .array(SubmissionKindSchema)
      .min(1)
      .max(5)
      .refine(isUnique, { message: "submission kinds must be unique" }),
    openAt: UtcDateTimeSchema,
    dueAt: UtcDateTimeSchema,
    lateUntil: UtcDateTimeSchema.nullable(),
    groupWork: z.boolean(),
    peerReview: PeerReviewSettingsSchema.nullable(),
    originalityCheck: z.boolean(),
    status: AssignmentStatusSchema,
    createdByStaffProfileId: IdSchema,
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine((assignment) => isAfter(assignment.dueAt, assignment.openAt), {
    message: "dueAt must be after openAt",
    path: ["dueAt"],
  })
  .refine(
    (assignment) =>
      assignment.lateUntil === null || isNotBefore(assignment.lateUntil, assignment.dueAt),
    { message: "lateUntil is before dueAt", path: ["lateUntil"] },
  )
  .refine(
    (assignment) =>
      assignment.peerReview === null || isAfter(assignment.peerReview.dueAt, assignment.dueAt),
    { message: "peer reviews are due after the assignment", path: ["peerReview", "dueAt"] },
  );
export type Assignment = z.infer<typeof AssignmentSchema>;

export const SubmissionStatusSchema = z.enum([
  "draft",
  "submitted",
  "late",
  "returned",
  "resubmission_requested",
]);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const AssignmentSubmissionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    assignmentId: IdSchema,
    learnerId: IdSchema,
    /** Other members of the submitting group. */
    groupLearnerIds: uniqueIds(10),
    attempt: z.int().min(1),
    status: SubmissionStatusSchema,
    /** Personal data (V-7). */
    text: z.string().max(20000).nullable(),
    files: z.array(SubmissionFileSchema).max(10),
    linkUrl: z.url({ protocol: /^https$/ }).nullable(),
    submittedAt: UtcDateTimeSchema.nullable(),
    /** Offline outbox client id (L2). */
    clientId: z.uuid(),
    deviceId: IdSchema.nullable(),
    ...timestamps,
  })
  .refine(validTimestampOrder, timestampOrderIssue)
  .refine((submission) => !submission.groupLearnerIds.includes(submission.learnerId), {
    message: "groupLearnerIds lists the other members only",
    path: ["groupLearnerIds"],
  })
  .refine((submission) => (submission.status === "draft") === (submission.submittedAt === null), {
    message: "submittedAt is set exactly when the submission is not a draft",
    path: ["submittedAt"],
  })
  .refine(
    (submission) =>
      submission.status === "draft" ||
      (submission.text !== null && submission.text.trim().length > 0) ||
      submission.files.length > 0 ||
      submission.linkUrl !== null,
    { message: "a submitted submission needs text, a file or a link", path: ["status"] },
  );
export type AssignmentSubmission = z.infer<typeof AssignmentSubmissionSchema>;

/** A person's marking of one submission. */
export const SubmissionFeedbackSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    submissionId: IdSchema,
    marks: HalfStepMarksSchema.nullable(),
    rubricScores: RubricScoresSchema.nullable(),
    /** Personal data (V-7). */
    comment: z.string().trim().max(5000).nullable(),
    markedByStaffProfileId: IdSchema,
    markedAt: UtcDateTimeSchema,
    releasedAt: UtcDateTimeSchema.nullable(),
  })
  .refine(
    (feedback) =>
      feedback.releasedAt === null || isNotBefore(feedback.releasedAt, feedback.markedAt),
    { message: "releasedAt is before markedAt", path: ["releasedAt"] },
  );
export type SubmissionFeedback = z.infer<typeof SubmissionFeedbackSchema>;

export const AiSuggestionDecisionSchema = z.enum(["pending", "accepted", "edited", "rejected"]);
export type AiSuggestionDecision = z.infer<typeof AiSuggestionDecisionSchema>;

/** An AI marking suggestion with its reasons and the person's decision (A-4, A-5); it never marks by itself. */
export const AiMarkingSuggestionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    submissionId: IdSchema,
    /** Always labelled as AI output (AGENTS §7). */
    aiGenerated: z.literal(true),
    tier: CapabilityTierSchema,
    suggestedMarks: HalfStepMarksSchema.nullable(),
    suggestedRubricScores: RubricScoresSchema.nullable(),
    reasons: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
    createdAt: UtcDateTimeSchema,
    decision: AiSuggestionDecisionSchema,
    decidedByStaffProfileId: IdSchema.nullable(),
    decidedAt: UtcDateTimeSchema.nullable(),
  })
  .refine(
    (suggestion) =>
      (suggestion.decision !== "pending") === (suggestion.decidedByStaffProfileId !== null) &&
      (suggestion.decision !== "pending") === (suggestion.decidedAt !== null),
    {
      message: "a person and a time are recorded exactly when the suggestion is decided",
      path: ["decidedByStaffProfileId"],
    },
  )
  .refine(
    (suggestion) =>
      suggestion.decidedAt === null || isNotBefore(suggestion.decidedAt, suggestion.createdAt),
    { message: "decidedAt is before createdAt", path: ["decidedAt"] },
  );
export type AiMarkingSuggestion = z.infer<typeof AiMarkingSuggestionSchema>;

export const PeerReviewSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    assignmentId: IdSchema,
    submissionId: IdSchema,
    /**
     * Null only on an anonymous review read by the submission's author or group (redacted read, as `IssuedDocumentRead`);
     * staff always see the reviewer.
     */
    reviewerLearnerId: IdSchema.nullable(),
    anonymous: z.boolean(),
    status: z.enum(["assigned", "submitted"]),
    rubricScores: RubricScoresSchema.nullable(),
    /** Personal data (V-7). */
    comment: z.string().trim().max(2000).nullable(),
    submittedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((review) => (review.status === "submitted") === (review.submittedAt !== null), {
    message: "submittedAt is set exactly when the review is submitted",
    path: ["submittedAt"],
  })
  .refine((review) => review.anonymous || review.reviewerLearnerId !== null, {
    message: "only an anonymous review may hide its reviewer",
    path: ["reviewerLearnerId"],
  });
export type PeerReview = z.infer<typeof PeerReviewSchema>;

export const OriginalityStatusSchema = z.enum(["pending", "ready", "failed", "not_configured"]);
export type OriginalityStatus = z.infer<typeof OriginalityStatusSchema>;

/** A similarity signal for a person to read; never a verdict. `provider` is a settings key, never a secret. */
export const OriginalitySignalSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    submissionId: IdSchema,
    provider: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
    status: OriginalityStatusSchema,
    similarityBps: z.int().min(0).max(10000).nullable(),
    externalId: z.string().trim().min(1).max(200).nullable(),
    checkedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((signal) => (signal.status === "ready") === (signal.similarityBps !== null), {
    message: "similarityBps is set exactly when the check is ready",
    path: ["similarityBps"],
  })
  .refine(
    (signal) =>
      (signal.status === "ready" || signal.status === "failed") === (signal.checkedAt !== null),
    { message: "checkedAt is set exactly when the check is ready or failed", path: ["checkedAt"] },
  );
export type OriginalitySignal = z.infer<typeof OriginalitySignalSchema>;
