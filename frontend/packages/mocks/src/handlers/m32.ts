import {
  AiMarkingSuggestionSchema,
  AssignmentSchema,
  AssignmentSubmissionSchema,
  OriginalitySignalSchema,
  PeerReviewSchema,
  SubmissionFeedbackSchema,
  pageSchema,
  type AssignmentSubmission,
  type CourseSpace,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";

const M = { module: "M32", permission: "m32.assignment.read" } as const;
const MARK = "m32.submission.mark";

/** Match the M30 course membership rules for teaching and learning records. */
export function learningSpaceAccess(viewer: Viewer, managePermission: string) {
  const { tenantId, personId, permissions } = viewer;
  const manage = permissions.has(managePermission);
  const staffIds = new Set(
    ofTenant(mockDb.roleProfiles, tenantId)
      .filter((row) => row.kind === "staff" && row.personId === personId)
      .map((row) => row.id),
  );
  const learnerIds = new Set(
    ofTenant(mockDb.learners, tenantId)
      .filter((row) => row.personId === personId)
      .map((row) => row.id),
  );
  const enrolments = ofTenant(mockDb.enrolments, tenantId).filter((row) =>
    learnerIds.has(row.learnerId),
  );
  const teaches = (space: CourseSpace) => space.staffProfileIds.some((id) => staffIds.has(id));
  const spaces = ofTenant(mockDb.courseSpaces, tenantId).filter(
    (space) =>
      manage ||
      (space.status === "published" &&
        (teaches(space) ||
          enrolments.some(
            (row) =>
              row.classGroupId !== null &&
              space.classGroupIds.includes(row.classGroupId) &&
              (space.academicYearId === null || row.academicYearId === space.academicYearId),
          ))),
  );
  const spaceById = (id: string | null) => found(spaces.find((space) => space.id === id));
  const readClassRows = (space: CourseSpace | null) =>
    (manage && learnerIds.size === 0) || (space !== null && teaches(space));
  return { spaces, spaceById, readClassRows, learnerIds, manage };
}

function assignmentAccess(viewer: Viewer) {
  const { tenantId } = viewer;
  const { manage, spaces, spaceById, readClassRows, learnerIds } = learningSpaceAccess(
    viewer,
    "m32.assignment.manage",
  );
  const spaceIds = new Set(spaces.map((space) => space.id));
  const assignments = ofTenant(mockDb.assignments, tenantId).filter(
    (row) =>
      spaceIds.has(row.courseSpaceId) && (manage || ["published", "closed"].includes(row.status)),
  );
  const assignmentById = (id: string | undefined) =>
    found(assignments.find((row) => row.id === id));
  const isAuthor = (row: AssignmentSubmission) =>
    learnerIds.has(row.learnerId) || row.groupLearnerIds.some((id) => learnerIds.has(id));
  const canReadClass = (courseSpaceId: string) => readClassRows(spaceById(courseSpaceId));

  function submissionAccess(id: string | undefined) {
    const submission = found(
      ofTenant(mockDb.assignmentSubmissions, tenantId).find((row) => row.id === id),
    );
    const assignment = assignmentById(submission.assignmentId);
    const staff = canReadClass(assignment.courseSpaceId);
    const author = isAuthor(submission);
    if (!staff && !author) throw new ApiFailure("not_found");
    return { submission, staff, author };
  }

  return { assignments, assignmentById, spaceById, isAuthor, canReadClass, submissionAccess };
}

export const m32Handlers = [
  get("/assignments", M, (ctx) => {
    const { assignments, spaceById } = assignmentAccess(ctx.viewer);
    const courseSpaceId = param(ctx.url, "courseSpaceId");
    if (courseSpaceId !== null) spaceById(courseSpaceId);
    const rows = assignments.filter(
      (row) => courseSpaceId === null || row.courseSpaceId === courseSpaceId,
    );
    return list(ctx, rows, pageSchema(AssignmentSchema));
  }),
  get("/assignments/:id", M, (ctx) =>
    ok(AssignmentSchema, assignmentAccess(ctx.viewer).assignmentById(ctx.params["id"])),
  ),
  get("/assignments/:id/submissions", M, (ctx) => {
    const { assignmentById, canReadClass, isAuthor } = assignmentAccess(ctx.viewer);
    const assignment = assignmentById(ctx.params["id"]);
    const staff = canReadClass(assignment.courseSpaceId);
    const rows = ofTenant(mockDb.assignmentSubmissions, ctx.viewer.tenantId).filter(
      (row) => row.assignmentId === assignment.id && (staff || isAuthor(row)),
    );
    return list(ctx, rows, pageSchema(AssignmentSubmissionSchema));
  }),
  get("/submissions/:id/feedback", M, (ctx) => {
    const { submission, staff } = assignmentAccess(ctx.viewer).submissionAccess(ctx.params["id"]);
    const rows = ofTenant(mockDb.submissionFeedback, ctx.viewer.tenantId).filter(
      (row) => row.submissionId === submission.id && (staff || row.releasedAt !== null),
    );
    return list(ctx, rows, pageSchema(SubmissionFeedbackSchema));
  }),
  get("/submissions/:id/peer-reviews", M, (ctx) => {
    const { submission, author } = assignmentAccess(ctx.viewer).submissionAccess(ctx.params["id"]);
    const rows = ofTenant(mockDb.peerReviews, ctx.viewer.tenantId)
      .filter(
        (row) => row.submissionId === submission.id && row.assignmentId === submission.assignmentId,
      )
      .map((row) => (author && row.anonymous ? { ...row, reviewerLearnerId: null } : row));
    return list(ctx, rows, pageSchema(PeerReviewSchema));
  }),
  get("/submissions/:id/originality", M, (ctx) => {
    if (!ctx.viewer.permissions.has(MARK)) throw new ApiFailure("forbidden");
    const { submission } = assignmentAccess(ctx.viewer).submissionAccess(ctx.params["id"]);
    const rows = ofTenant(mockDb.originalitySignals, ctx.viewer.tenantId).filter(
      (row) => row.submissionId === submission.id,
    );
    return list(ctx, rows, pageSchema(OriginalitySignalSchema));
  }),
  get("/submissions/:id/ai-suggestions", M, (ctx) => {
    if (!ctx.viewer.permissions.has(MARK)) throw new ApiFailure("forbidden");
    const { submission } = assignmentAccess(ctx.viewer).submissionAccess(ctx.params["id"]);
    const rows = ofTenant(mockDb.aiMarkingSuggestions, ctx.viewer.tenantId).filter(
      (row) => row.submissionId === submission.id,
    );
    return list(ctx, rows, pageSchema(AiMarkingSuggestionSchema));
  }),
];
