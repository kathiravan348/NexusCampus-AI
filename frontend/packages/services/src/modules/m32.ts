import {
  AiMarkingSuggestionSchema,
  AssignmentSchema,
  AssignmentSubmissionSchema,
  OriginalitySignalSchema,
  PeerReviewSchema,
  SubmissionFeedbackSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const AssignmentPage = pageSchema(AssignmentSchema);
const AssignmentSubmissionPage = pageSchema(AssignmentSubmissionSchema);
const SubmissionFeedbackPage = pageSchema(SubmissionFeedbackSchema);
const PeerReviewPage = pageSchema(PeerReviewSchema);
const OriginalitySignalPage = pageSchema(OriginalitySignalSchema);
const AiMarkingSuggestionPage = pageSchema(AiMarkingSuggestionSchema);

export function useAssignments(courseSpaceId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m32.assignments(s, courseSpaceId),
    (c, signal) =>
      c.get(
        "/assignments",
        AssignmentPage,
        courseSpaceId === null ? all : { ...all, courseSpaceId },
        { signal },
      ),
  );
}

export function useAssignment(assignmentId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m32.assignment(s, assignmentId),
    (c, signal) =>
      c.get(`/assignments/${encodeURIComponent(assignmentId ?? "")}`, AssignmentSchema, undefined, {
        signal,
      }),
    assignmentId !== null,
  );
}

export function useAssignmentSubmissions(assignmentId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m32.assignmentSubmissions(s, assignmentId),
    (c, signal) =>
      c.get(
        `/assignments/${encodeURIComponent(assignmentId ?? "")}/submissions`,
        AssignmentSubmissionPage,
        all,
        { signal },
      ),
    assignmentId !== null,
  );
}

export function useSubmissionFeedback(submissionId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m32.submissionFeedback(s, submissionId),
    (c, signal) =>
      c.get(
        `/submissions/${encodeURIComponent(submissionId ?? "")}/feedback`,
        SubmissionFeedbackPage,
        all,
        { signal },
      ),
    submissionId !== null,
  );
}

export function usePeerReviews(submissionId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m32.peerReviews(s, submissionId),
    (c, signal) =>
      c.get(
        `/submissions/${encodeURIComponent(submissionId ?? "")}/peer-reviews`,
        PeerReviewPage,
        all,
        { signal },
      ),
    submissionId !== null,
  );
}

export function useOriginalitySignals(submissionId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m32.originalitySignals(s, submissionId),
    (c, signal) =>
      c.get(
        `/submissions/${encodeURIComponent(submissionId ?? "")}/originality`,
        OriginalitySignalPage,
        all,
        { signal },
      ),
    submissionId !== null,
  );
}

export function useAiMarkingSuggestions(submissionId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m32.aiMarkingSuggestions(s, submissionId),
    (c, signal) =>
      c.get(
        `/submissions/${encodeURIComponent(submissionId ?? "")}/ai-suggestions`,
        AiMarkingSuggestionPage,
        all,
        { signal },
      ),
    submissionId !== null,
  );
}
