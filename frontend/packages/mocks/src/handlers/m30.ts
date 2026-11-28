import {
  CourseItemSchema,
  CourseModuleSchema,
  CourseProgressSchema,
  CourseSpaceSchema,
  DiscussionPostInputSchema,
  DiscussionPostSchema,
  DiscussionThreadSchema,
  pageSchema,
  type CourseSpace,
} from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
import {
  ApiFailure,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, ok } from "./route";

const M = { module: "M30", permission: "m30.course.read" } as const;
const MANAGE = "m30.course.manage";
const postReceipts = new Map<string, string>();

function authorProfile(viewer: Viewer, space: CourseSpace) {
  const profiles = ofTenant(mockDb.roleProfiles, viewer.tenantId).filter(
    (row) => row.personId === viewer.personId && row.status === "active",
  );
  const teaching = profiles.find(
    (row) => row.kind === "staff" && space.staffProfileIds.includes(row.id),
  );
  if (teaching) return teaching;
  const staff = profiles.find((row) => row.kind === "staff");
  if (staff) return staff;
  const learner = profiles.find((row) => row.kind === "learner");
  if (learner) return learner;
  const fallback = profiles[0];
  if (!fallback) throw new ApiFailure("forbidden");
  return fallback;
}

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
  http.post(`*${API_BASE}/threads/:id/posts`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, "M30")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has("m30.course.read")) throw new ApiFailure("forbidden");
      const threadId = typeof params["id"] === "string" ? params["id"] : undefined;
      const thread = found(
        ofTenant(mockDb.discussionThreads, viewer.tenantId).find((row) => row.id === threadId),
      );
      const space = courseAccess(viewer).spaceById(thread.courseSpaceId);
      const author = authorProfile(viewer, space);

      const key = request.headers.get("Idempotency-Key");
      const receiptKey = key && JSON.stringify([viewer.tenantId, thread.id, author.id, key]);
      const savedId = receiptKey ? postReceipts.get(receiptKey) : undefined;
      const saved = savedId
        ? ofTenant(mockDb.discussionPosts, viewer.tenantId).find(
            (row) => row.id === savedId && row.threadId === thread.id,
          )
        : undefined;
      if (saved) {
        const payload = DiscussionPostSchema.parse(saved) as JsonBodyType;
        return HttpResponse.json(payload, { status: 201 });
      }

      if (thread.locked) {
        throw new ApiFailure("conflict", [{ path: "locked", message: "Thread is locked" }]);
      }

      const raw: unknown = await request.json().catch(() => undefined);
      const parsed = DiscussionPostInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((issue) => ({
            path: String(issue.path[0] ?? ""),
            message: "Invalid discussion post field",
          })),
        );
      }

      const moderate = viewer.permissions.has("m30.discussion.moderate");
      const { parentPostId, body } = parsed.data;
      if (parentPostId !== null) {
        const parent = ofTenant(mockDb.discussionPosts, viewer.tenantId).find(
          (row) =>
            row.id === parentPostId && row.threadId === thread.id && (moderate || !row.hidden),
        );
        if (!parent) {
          throw new ApiFailure("invalid_request", [
            { path: "parentPostId", message: "Invalid parent post" },
          ]);
        }
      }

      const now = new Date().toISOString();
      const created = DiscussionPostSchema.parse({
        id: `dpo-${globalThis.crypto.randomUUID().slice(0, 8)}`,
        tenantId: viewer.tenantId,
        threadId: thread.id,
        parentPostId,
        authorProfileId: author.id,
        body,
        hidden: false,
        hiddenByProfileId: null,
        createdAt: now,
        editedAt: null,
      });
      mockDb.discussionPosts.push(created);
      const index = mockDb.discussionThreads.indexOf(thread);
      mockDb.discussionThreads[index] = DiscussionThreadSchema.parse({
        ...thread,
        postCount: thread.postCount + 1,
        lastPostAt: now,
      });
      if (receiptKey) postReceipts.set(receiptKey, created.id);
      return HttpResponse.json(created as JsonBodyType, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
