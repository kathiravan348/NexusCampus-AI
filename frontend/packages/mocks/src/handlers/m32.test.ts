import {
  AiMarkingSuggestionSchema,
  AssignmentSchema,
  AssignmentSubmissionSchema,
  OriginalitySignalSchema,
  PeerReviewSchema,
  SubmissionFeedbackSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { roleId } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

const tenant = TENANT.riverside;

function get(path: string, userId: string = USER.rvHelen, tenantId: string = tenant) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function signInAs(personId: string, role: "learner" | "teacher") {
  const user = mockDb.users.find((row) => row.id === USER.rvHelen)!;
  user.personId = personId;
  const assignment = mockDb.roleAssignments.find((row) => row.userId === user.id)!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== user.id);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenant, role) });
}

function essay() {
  const review = mockDb.peerReviews.find((row) => row.tenantId === tenant && row.anonymous)!;
  const submission = mockDb.assignmentSubmissions.find((row) => row.id === review.submissionId)!;
  const assignment = mockDb.assignments.find((row) => row.id === submission.assignmentId)!;
  return {
    assignment,
    submission,
    review,
    assignmentPath: `/assignments/${assignment.id}`,
    submissionPath: `/submissions/${submission.id}`,
  };
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  expect(response.status).toBe(200);
  return schema.parse(await response.json());
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M32 read handlers", () => {
  it("serves all assignment endpoints to an admin", async () => {
    const { assignment, submission, review, assignmentPath, submissionPath } = essay();
    const assignments = await parse(
      await get(`/assignments?courseSpaceId=${assignment.courseSpaceId}`),
      pageSchema(AssignmentSchema),
    );
    expect(assignments.items).toEqual([assignment]);
    expect(await parse(await get(assignmentPath), AssignmentSchema)).toEqual(assignment);
    const submissions = await parse(
      await get(`${assignmentPath}/submissions`),
      pageSchema(AssignmentSubmissionSchema),
    );
    expect(submissions.total).toBe(2);
    const feedback = await parse(
      await get(`${submissionPath}/feedback`),
      pageSchema(SubmissionFeedbackSchema),
    );
    expect(feedback.items[0]?.submissionId).toBe(submission.id);
    const reviews = await parse(
      await get(`${submissionPath}/peer-reviews`),
      pageSchema(PeerReviewSchema),
    );
    expect(reviews.items).toEqual([review]);
    const suggestions = await parse(
      await get(`${submissionPath}/ai-suggestions`),
      pageSchema(AiMarkingSuggestionSchema),
    );
    expect(suggestions.items[0]?.aiGenerated).toBe(true);

    const originality = mockDb.originalitySignals[0]!;
    const admin = mockDb.users.find(
      (row) =>
        row.tenantId === originality.tenantId &&
        permissionsOf(row.id).has("m32.assignment.manage") &&
        permissionsOf(row.id).has("m32.submission.mark"),
    )!;
    const signals = await parse(
      await get(`/submissions/${originality.submissionId}/originality`, admin.id, admin.tenantId),
      pageSchema(OriginalitySignalSchema),
    );
    expect(signals.items).toContainEqual(originality);
  });

  it("limits learners to visible assignments, own submissions and released feedback", async () => {
    const { assignment, submission, review, assignmentPath, submissionPath } = essay();
    const learner = mockDb.learners.find((row) => row.id === submission.learnerId)!;
    signInAs(learner.personId, "learner");
    const other = mockDb.assignmentSubmissions.find(
      (row) => row.assignmentId === assignment.id && row.id !== submission.id,
    )!;
    const released = mockDb.submissionFeedback.find((row) => row.submissionId === submission.id)!;
    mockDb.submissionFeedback.push({ ...released, id: "feedback-unreleased", releasedAt: null });
    mockDb.assignments.push({ ...assignment, id: "assignment-draft", status: "draft" });

    const assignments = await parse(await get("/assignments"), pageSchema(AssignmentSchema));
    expect(assignments.items).toContainEqual(assignment);
    expect(assignments.items.every((row) => ["published", "closed"].includes(row.status))).toBe(
      true,
    );
    expect((await get("/assignments/assignment-draft")).status).toBe(404);
    const submissions = await parse(
      await get(`${assignmentPath}/submissions`),
      pageSchema(AssignmentSubmissionSchema),
    );
    expect(submissions.items).toEqual([submission]);
    const feedback = await parse(
      await get(`${submissionPath}/feedback`),
      pageSchema(SubmissionFeedbackSchema),
    );
    expect(feedback.items).toEqual([released]);
    const reviews = await parse(
      await get(`${submissionPath}/peer-reviews`),
      pageSchema(PeerReviewSchema),
    );
    expect(reviews.items).toEqual([{ ...review, reviewerLearnerId: null }]);
    expect((await get(`/submissions/${other.id}/feedback`)).status).toBe(404);
    expect((await get(`/submissions/${other.id}/peer-reviews`)).status).toBe(404);
    expect((await get(`${submissionPath}/originality`)).status).toBe(403);
    expect((await get(`${submissionPath}/ai-suggestions`)).status).toBe(403);

    const groupReview = mockDb.peerReviews.find((row) => row.submissionId === other.id)!;
    const reviewer = mockDb.learners.find(
      (row) => row.tenantId === tenant && row.id !== learner.id && row.id !== other.learnerId,
    )!;
    groupReview.reviewerLearnerId = reviewer.id;
    other.groupLearnerIds = [learner.id];
    const groupSubmissions = await parse(
      await get(`${assignmentPath}/submissions`),
      pageSchema(AssignmentSubmissionSchema),
    );
    expect(groupSubmissions.items).toEqual([submission, other]);
    const groupReviews = await parse(
      await get(`/submissions/${other.id}/peer-reviews`),
      pageSchema(PeerReviewSchema),
    );
    expect(groupReviews.items).toEqual([
      expect.objectContaining({ submissionId: other.id, reviewerLearnerId: null }),
    ]);
  });

  it("lets a teacher of the space see all its submissions and reviewer identities", async () => {
    const { assignment, review, assignmentPath, submissionPath } = essay();
    const staff = mockDb.roleProfiles.find((row) => row.id === assignment.createdByStaffProfileId)!;
    signInAs(staff.personId, "teacher");
    const teacherRole = mockDb.roles.find((row) => row.id === roleId(tenant, "teacher"))!;
    teacherRole.permissions = teacherRole.permissions.filter(
      (code) => code !== "m32.assignment.manage",
    );
    const submissions = await parse(
      await get(`${assignmentPath}/submissions`),
      pageSchema(AssignmentSubmissionSchema),
    );
    expect(submissions.items).toEqual(
      mockDb.assignmentSubmissions.filter((row) => row.assignmentId === assignment.id),
    );
    const reviews = await parse(
      await get(`${submissionPath}/peer-reviews`),
      pageSchema(PeerReviewSchema),
    );
    expect(reviews.items).toEqual([review]);
  });

  it("returns 404 for foreign course, assignment and submission IDs", async () => {
    const { assignment, assignmentPath, submissionPath } = essay();
    for (const path of [
      `/assignments?courseSpaceId=${assignment.courseSpaceId}`,
      assignmentPath,
      `${assignmentPath}/submissions`,
      `${submissionPath}/feedback`,
      `${submissionPath}/peer-reviews`,
      `${submissionPath}/originality`,
      `${submissionPath}/ai-suggestions`,
    ]) {
      expect((await get(path, USER.lsPriya, TENANT.littleSteps)).status).toBe(404);
    }
  });

  it("requires assignment read permission and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    const forbidden = await get("/assignments");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M32",
    );
    const disabled = await get("/assignments");
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
