import {
  LearningPathSchema,
  MasteryRecordSchema,
  TutorMessageSchema,
  TutorSessionSchema,
  TutorSettingsSchema,
  pageSchema,
  type CourseSpace,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";

const MASTERY = { module: "M35", permission: "m35.mastery.read" } as const;
const MANAGE = { module: "M35", permission: "m35.tutor.manage" } as const;
const TRANSCRIPT = { module: "M35", permission: "m35.transcript.read" } as const;

function learnersOfSpaces(tenantId: string, spaces: readonly CourseSpace[]): Set<string> {
  const ids = new Set<string>();
  const enrolments = ofTenant(mockDb.enrolments, tenantId);
  for (const space of spaces) {
    for (const row of enrolments) {
      if (
        row.classGroupId !== null &&
        space.classGroupIds.includes(row.classGroupId) &&
        (space.academicYearId === null || row.academicYearId === space.academicYearId)
      ) {
        ids.add(row.learnerId);
      }
    }
  }
  return ids;
}

function outcomesOfSpace(tenantId: string, courseSpaceId: string): Set<string> {
  const ids = new Set<string>();
  for (const mod of ofTenant(mockDb.courseModules, tenantId)) {
    if (mod.courseSpaceId !== courseSpaceId) continue;
    for (const outcomeId of mod.outcomeIds) ids.add(outcomeId);
  }
  return ids;
}

function m35Access(viewer: Viewer) {
  const { tenantId, personId, permissions } = viewer;
  const all = permissions.has("m35.tutor.manage");
  const staffIds = new Set(
    ofTenant(mockDb.roleProfiles, tenantId)
      .filter((row) => row.kind === "staff" && row.personId === personId)
      .map((row) => row.id),
  );
  const spaces = ofTenant(mockDb.courseSpaces, tenantId).filter(
    (space) => all || space.staffProfileIds.some((id) => staffIds.has(id)),
  );
  const spaceIds = new Set(spaces.map((space) => space.id));
  const spaceById = (id: string | undefined) => found(spaces.find((space) => space.id === id));
  const learnerIds = all
    ? new Set(ofTenant(mockDb.learners, tenantId).map((row) => row.id))
    : learnersOfSpaces(tenantId, spaces);
  const checkLearner = (id: string) => {
    if (!learnerIds.has(id)) throw new ApiFailure("not_found");
  };
  return { spaceIds, spaceById, learnerIds, checkLearner };
}

export const m35Handlers = [
  get("/mastery", MASTERY, (ctx) => {
    const { tenantId } = ctx.viewer;
    const { spaceById, learnerIds, checkLearner } = m35Access(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    const courseSpaceId = param(ctx.url, "courseSpaceId");
    if (learnerId !== null) checkLearner(learnerId);
    const space = courseSpaceId === null ? null : spaceById(courseSpaceId);
    const spaceLearners = space === null ? null : learnersOfSpaces(tenantId, [space]);
    const spaceOutcomes = space === null ? null : outcomesOfSpace(tenantId, space.id);
    const rows = ofTenant(mockDb.masteryRecords, tenantId).filter(
      (row) =>
        learnerIds.has(row.learnerId) &&
        (learnerId === null || row.learnerId === learnerId) &&
        (spaceLearners === null || spaceLearners.has(row.learnerId)) &&
        (spaceOutcomes === null || spaceOutcomes.has(row.outcomeId)),
    );
    return list(ctx, rows, pageSchema(MasteryRecordSchema));
  }),
  get("/learning-paths", MASTERY, (ctx) => {
    const { tenantId } = ctx.viewer;
    const { learnerIds, checkLearner } = m35Access(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const rows = ofTenant(mockDb.learningPaths, tenantId).filter(
      (r) => learnerIds.has(r.learnerId) && (learnerId === null || r.learnerId === learnerId),
    );
    return list(ctx, rows, pageSchema(LearningPathSchema));
  }),
  get("/course-spaces/:id/tutor", MANAGE, (ctx) => {
    const { tenantId } = ctx.viewer;
    const space = found(
      ofTenant(mockDb.courseSpaces, tenantId).find((row) => row.id === ctx.params["id"]),
    );
    const settings = found(
      ofTenant(mockDb.tutorSettings, tenantId).find((row) => row.courseSpaceId === space.id),
    );
    return ok(TutorSettingsSchema, settings);
  }),
  get("/tutor-sessions", TRANSCRIPT, (ctx) => {
    const { tenantId } = ctx.viewer;
    const { spaceIds, spaceById } = m35Access(ctx.viewer);
    const courseSpaceId = param(ctx.url, "courseSpaceId");
    if (courseSpaceId !== null) spaceById(courseSpaceId);
    const rows = ofTenant(mockDb.tutorSessions, tenantId).filter(
      (row) =>
        spaceIds.has(row.courseSpaceId) &&
        (courseSpaceId === null || row.courseSpaceId === courseSpaceId),
    );
    return list(ctx, rows, pageSchema(TutorSessionSchema));
  }),
  get("/tutor-sessions/:id/messages", TRANSCRIPT, (ctx) => {
    const { tenantId } = ctx.viewer;
    const { spaceIds } = m35Access(ctx.viewer);
    const session = found(
      ofTenant(mockDb.tutorSessions, tenantId).find(
        (row) => row.id === ctx.params["id"] && spaceIds.has(row.courseSpaceId),
      ),
    );
    if (!session.transcriptsVisibleToStaff && !session.flaggedForReview) {
      throw new ApiFailure("forbidden");
    }
    const rows = ofTenant(mockDb.tutorMessages, tenantId).filter(
      (row) => row.sessionId === session.id,
    );
    return list(ctx, rows, pageSchema(TutorMessageSchema));
  }),
];
