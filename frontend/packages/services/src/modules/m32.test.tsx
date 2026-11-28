import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useAiMarkingSuggestions,
  useAssignment,
  useAssignmentSubmissions,
  useAssignments,
  useOriginalitySignals,
  usePeerReviews,
  useSubmissionFeedback,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M32 hooks", () => {
  it("loads filtered assignments, assignment details and submission records", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const assignments = useAssignments();
        const essay = assignments.data?.items.find((row) => row.peerReview !== null);
        const assignment = useAssignment(essay?.id ?? null);
        const filtered = useAssignments(essay?.courseSpaceId ?? null);
        const submissions = useAssignmentSubmissions(essay?.id ?? null);
        const submissionId =
          submissions.data?.items.find((row) => row.status === "returned")?.id ?? null;
        return {
          assignments,
          assignment,
          filtered,
          submissions,
          feedback: useSubmissionFeedback(submissionId),
          reviews: usePeerReviews(submissionId),
          originality: useOriginalitySignals(submissionId),
          suggestions: useAiMarkingSuggestions(submissionId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const {
        assignments,
        assignment,
        filtered,
        submissions,
        feedback,
        reviews,
        originality,
        suggestions,
      } = result.current;
      expect(assignments.data?.total).toBe(2);
      expect(assignment.data?.status).toBe("closed");
      expect(filtered.data?.items).toEqual([assignment.data]);
      expect(submissions.data?.total).toBe(2);
      expect(feedback.data?.items[0]?.marks).toBe(26);
      expect(reviews.data?.items[0]?.anonymous).toBe(true);
      expect(originality.data?.items).toEqual([]);
      expect(suggestions.data?.items[0]?.aiGenerated).toBe(true);
    });
  });
});
