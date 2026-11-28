import {
  CourseItemSchema,
  CourseModuleSchema,
  CourseProgressSchema,
  CourseSpaceSchema,
  DiscussionPostSchema,
  DiscussionThreadSchema,
  pageSchema,
  type CourseSpace,
} from "@nexus/contracts";
import { ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok } from "./route";

const M = { module: "M30", permission: "m30.course.read" } as const;
const MANAGE = "m30.course.manage";

function courseAccess(viewer: Viewer) {
  const { tenantId, personId, permissions } = viewer;
  const manage = permissions.has(MANAGE);
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
  const spaceById = (id: string | undefined) => found(spaces.find((space) => space.id === id));
  return { spaces, spaceById, teaches, learnerIds, manage };
}

function modulesOf(space: CourseSpace) {
  return ofTenant(mockDb.courseModules, space.tenantId).filter(
    (row) => row.courseSpaceId === space.id,
  );
}

function itemsOf(space: CourseSpace, manage: boolean) {
  const moduleIds = new Set(modulesOf(space).map((row) => row.id));
  return ofTenant(mockDb.courseItems, space.tenantId).filter(
    (row) => moduleIds.has(row.moduleId) && (manage || row.published),
  );
}

export const m30Handlers = [
  get("/course-spaces", M, (ctx) =>
    list(ctx, courseAccess(ctx.viewer).spaces, pageSchema(CourseSpaceSchema)),
  ),
  get("/course-spaces/:id", M, (ctx) =>
    ok(CourseSpaceSchema, courseAccess(ctx.viewer).spaceById(ctx.params["id"])),
  ),
  get("/course-spaces/:id/modules", M, (ctx) => {
    const space = courseAccess(ctx.viewer).spaceById(ctx.params["id"]);
    return list(ctx, modulesOf(space), pageSchema(CourseModuleSchema));
  }),
  get("/course-spaces/:id/items", M, (ctx) => {
    const { spaceById, manage } = courseAccess(ctx.viewer);
    return list(ctx, itemsOf(spaceById(ctx.params["id"]), manage), pageSchema(CourseItemSchema));
  }),
  get("/course-spaces/:id/progress", M, (ctx) => {
    const { spaceById, manage, teaches, learnerIds } = courseAccess(ctx.viewer);
    const space = spaceById(ctx.params["id"]);
    const allLearners = manage || teaches(space);
    const rows = ofTenant(mockDb.courseProgress, space.tenantId).filter(
      (row) => row.courseSpaceId === space.id && (allLearners || learnerIds.has(row.learnerId)),
    );
    if (manage) return list(ctx, rows, pageSchema(CourseProgressSchema));

    const visibleIds = new Set(itemsOf(space, false).map((row) => row.id));
    const visibleRows = rows.map((row) => ({
      ...row,
      completedItemIds: row.completedItemIds.filter((id) => visibleIds.has(id)),
    }));
    return list(ctx, visibleRows, pageSchema(CourseProgressSchema));
  }),
  get("/course-spaces/:id/threads", M, (ctx) => {
    const space = courseAccess(ctx.viewer).spaceById(ctx.params["id"]);
    const rows = ofTenant(mockDb.discussionThreads, space.tenantId).filter(
      (row) => row.courseSpaceId === space.id,
    );
    return list(ctx, rows, pageSchema(DiscussionThreadSchema));
  }),
  get("/threads/:id/posts", M, (ctx) => {
    const { tenantId, permissions } = ctx.viewer;
    const thread = found(
      ofTenant(mockDb.discussionThreads, tenantId).find((row) => row.id === ctx.params["id"]),
    );
    courseAccess(ctx.viewer).spaceById(thread.courseSpaceId);
    const moderate = permissions.has("m30.discussion.moderate");
    const rows = ofTenant(mockDb.discussionPosts, tenantId).filter(
      (row) => row.threadId === thread.id && (moderate || !row.hidden),
    );
    return list(ctx, rows, pageSchema(DiscussionPostSchema));
  }),
];
