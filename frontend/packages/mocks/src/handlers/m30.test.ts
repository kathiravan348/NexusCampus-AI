import {
  CourseItemSchema,
  CourseModuleSchema,
  CourseProgressSchema,
  CourseSpaceSchema,
  DiscussionPostSchema,
  DiscussionThreadSchema,
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

function get(path: string, userId: string, tenantId: string = tenant) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function post(
  path: string,
  userId: string,
  body: unknown,
  tenantId: string = tenant,
  idempotencyKey?: string,
) {
  return fetch(`http://localhost/api/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: tenantId,
      [MOCK_HEADER.user]: userId,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function admin() {
  return mockDb.users.find(
    (row) => row.tenantId === tenant && permissionsOf(row.id).has("m30.course.manage"),
  )!.id;
}

function signInLearner(tenantId: string, userId: string, personId: string) {
  mockDb.users = mockDb.users.map((row) =>
    row.tenantId === tenantId && row.id === userId ? { ...row, personId } : row,
  );
  const assignment = mockDb.roleAssignments.find(
    (row) => row.tenantId === tenantId && row.userId === userId,
  )!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== userId);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenantId, "learner") });
  return userId;
}

function userFor(personId: string) {
  return mockDb.users.find((row) => row.tenantId === tenant && row.personId === personId)!.id;
}

function mathCourse() {
  const thread = mockDb.discussionThreads.find((row) => row.tenantId === tenant)!;
  const space = mockDb.courseSpaces.find((row) => row.id === thread.courseSpaceId)!;
  return { thread, space, path: `/course-spaces/${space.id}` };
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

describe("M30 read handlers", () => {
  it("serves every course endpoint to an admin, including moderated posts", async () => {
    const { thread, space, path } = mathCourse();
    const request = (route: string) => get(route, admin());
    const spaces = await parse(await request("/course-spaces"), pageSchema(CourseSpaceSchema));
    expect(spaces.items).toEqual(mockDb.courseSpaces.filter((row) => row.tenantId === tenant));
    expect(await parse(await request(path), CourseSpaceSchema)).toEqual(space);

    const modules = await parse(await request(`${path}/modules`), pageSchema(CourseModuleSchema));
    const items = await parse(await request(`${path}/items`), pageSchema(CourseItemSchema));
    const progress = await parse(
      await request(`${path}/progress`),
      pageSchema(CourseProgressSchema),
    );
    const threads = await parse(
      await request(`${path}/threads`),
      pageSchema(DiscussionThreadSchema),
    );
    const posts = await parse(
      await request(`/threads/${thread.id}/posts`),
      pageSchema(DiscussionPostSchema),
    );
    expect(modules.total).toBe(3);
    expect(items.total).toBe(6);
    expect(progress.total).toBe(1);
    expect(threads.items).toEqual([thread]);
    expect(posts.total).toBe(3);
    expect(posts.items.some((row) => row.hidden)).toBe(true);
  });

  it("limits learners to published member spaces, items, own progress and visible posts", async () => {
    const { thread, space, path } = mathCourse();
    const progress = mockDb.courseProgress.find((row) => row.courseSpaceId === space.id)!;
    const learner = mockDb.learners.find((row) => row.id === progress.learnerId)!;
    const otherLearner = mockDb.learners.find(
      (row) => row.tenantId === tenant && row.id !== learner.id,
    )!;
    mockDb.courseProgress.push({ ...progress, learnerId: otherLearner.id });
    mockDb.courseSpaces.push({ ...space, id: "test-draft-space", status: "draft" });
    const module = mockDb.courseModules.find((row) => row.courseSpaceId === space.id)!;
    const item = mockDb.courseItems.find((row) => row.moduleId === module.id)!;
    mockDb.courseItems.push({ ...item, id: "test-draft-item", published: false });
    const user = signInLearner(tenant, admin(), learner.personId);
    const spaces = await parse(await get("/course-spaces", user), pageSchema(CourseSpaceSchema));
    expect(spaces.items.map((row) => row.id)).toContain(space.id);
    expect(spaces.items.every((row) => row.status === "published")).toBe(true);
    const unrelated = mockDb.courseSpaces.find(
      (row) => row.tenantId === tenant && !row.classGroupIds.includes(space.classGroupIds[0]!),
    )!;
    expect(spaces.items.map((row) => row.id)).not.toContain(unrelated.id);
    expect((await get("/course-spaces/test-draft-space", user)).status).toBe(404);
    expect((await get(`/course-spaces/${unrelated.id}/items`, user)).status).toBe(404);

    const items = await parse(await get(`${path}/items`, user), pageSchema(CourseItemSchema));
    expect(items.total).toBe(6);
    expect(items.items.every((row) => row.published)).toBe(true);
    const rows = await parse(await get(`${path}/progress`, user), pageSchema(CourseProgressSchema));
    expect(rows.items).toEqual([progress]);
    const posts = await parse(
      await get(`/threads/${thread.id}/posts`, user),
      pageSchema(DiscussionPostSchema),
    );
    expect(posts.total).toBe(2);
    expect(posts.items.every((row) => !row.hidden)).toBe(true);
  });

  it("lets teachers see spaces they teach and all progress for those spaces", async () => {
    const { space, path } = mathCourse();
    const staff = mockDb.roleProfiles.find((row) => space.staffProfileIds.includes(row.id))!;
    const progress = mockDb.courseProgress.find((row) => row.courseSpaceId === space.id)!;
    const otherLearner = mockDb.learners.find(
      (row) => row.tenantId === tenant && row.id !== progress.learnerId,
    )!;
    const secondProgress = { ...progress, learnerId: otherLearner.id };
    mockDb.courseProgress.push(secondProgress);
    const user = userFor(staff.personId);
    const spaces = await parse(await get("/course-spaces", user), pageSchema(CourseSpaceSchema));
    expect(spaces.items).toContainEqual(space);
    expect(spaces.items.every((row) => row.staffProfileIds.includes(staff.id))).toBe(true);
    const rows = await parse(await get(`${path}/progress`, user), pageSchema(CourseProgressSchema));
    expect(rows.items).toEqual([progress, secondProgress]);
  });

  it("returns 404 for foreign spaces, their child routes and threads", async () => {
    const { path, thread } = mathCourse();
    for (const suffix of ["", "/modules", "/items", "/progress", "/threads"]) {
      expect((await get(path + suffix, USER.lsPriya, TENANT.littleSteps)).status).toBe(404);
    }
    expect(
      (await get(`/threads/${thread.id}/posts`, USER.lsPriya, TENANT.littleSteps)).status,
    ).toBe(404);
  });

  it("requires both course read permission and entitlement", async () => {
    const user = admin();
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== user);
    const forbidden = await get("/course-spaces", user);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M30",
    );
    const disabled = await get("/course-spaces", user);
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});

describe("M30 discussion post write handler", () => {
  it("posts top-level and nested replies, bumps thread stats and supports idempotency", async () => {
    const { thread, space } = mathCourse();
    const progress = mockDb.courseProgress.find((row) => row.courseSpaceId === space.id)!;
    const learner = mockDb.learners.find((row) => row.id === progress.learnerId)!;
    const user = signInLearner(tenant, admin(), learner.personId);
    const parent = mockDb.discussionPosts.find((r) => r.threadId === thread.id && !r.hidden)!;
    const initialCount = thread.postCount;
    const route = `/threads/${thread.id}/posts`;

    const first = await post(route, user, { parentPostId: null, body: "Thanks!" }, tenant, "k-1");
    expect(first.status).toBe(201);
    const created = DiscussionPostSchema.parse(await first.json());
    expect(created).toMatchObject({
      tenantId: tenant,
      threadId: thread.id,
      parentPostId: null,
      authorProfileId: learner.roleProfileId,
      body: "Thanks!",
      hidden: false,
      hiddenByProfileId: null,
    });

    const replay = await post(route, user, { parentPostId: null, body: "Thanks!" }, tenant, "k-1");
    expect(replay.status).toBe(201);
    expect(DiscussionPostSchema.parse(await replay.json()).id).toBe(created.id);

    const nested = await post(route, user, { parentPostId: parent.id, body: "Makes sense." });
    expect(nested.status).toBe(201);
    expect(DiscussionPostSchema.parse(await nested.json()).parentPostId).toBe(parent.id);

    const updatedThread = mockDb.discussionThreads.find((row) => row.id === thread.id)!;
    expect(updatedThread.postCount).toBe(initialCount + 2);
    expect(updatedThread.lastPostAt).not.toBe(thread.lastPostAt);
  });

  it("returns 409 on locked threads and 400 on bad parents without leaking text", async () => {
    const { thread, space } = mathCourse();
    const route = `/threads/${thread.id}/posts`;
    const otherPost = mockDb.discussionPosts.find((row) => row.threadId !== thread.id)!;
    const hiddenPost = mockDb.discussionPosts.find((r) => r.threadId === thread.id && r.hidden)!;
    const progress = mockDb.courseProgress.find((row) => row.courseSpaceId === space.id)!;
    const learner = mockDb.learners.find((row) => row.id === progress.learnerId)!;
    const staffUser = admin();

    const secret = "SECRET-BODY-TEXT";
    const badParent = await post(route, staffUser, { parentPostId: otherPost.id, body: secret });
    expect(badParent.status).toBe(400);
    const badParentText = await badParent.text();
    expect(JSON.parse(badParentText)).toMatchObject({ error: { code: "invalid_request" } });
    expect(badParentText).not.toContain(secret);

    const longBody = "x".repeat(5001);
    const tooLong = await post(route, staffUser, { parentPostId: null, body: longBody });
    expect(tooLong.status).toBe(400);
    expect(await tooLong.text()).not.toContain("xxxxx");

    const learnerUser = signInLearner(tenant, USER.rvOliver, learner.personId);
    const hiddenParent = await post(route, learnerUser, {
      parentPostId: hiddenPost.id,
      body: "Reply to hidden",
    });
    expect(hiddenParent.status).toBe(400);

    const idx = mockDb.discussionThreads.indexOf(thread);
    mockDb.discussionThreads[idx] = { ...thread, locked: true };
    const locked = await post(route, staffUser, { parentPostId: null, body: secret });
    expect(locked.status).toBe(409);
    const lockedText = await locked.text();
    expect(JSON.parse(lockedText)).toMatchObject({ error: { code: "conflict" } });
    expect(lockedText).not.toContain(secret);
  });

  it("returns 404 for another tenant's thread or an inaccessible space", async () => {
    const { thread } = mathCourse();
    const route = `/threads/${thread.id}/posts`;
    const foreign = await post(
      route,
      USER.lsPriya,
      { parentPostId: null, body: "Cross-tenant" },
      TENANT.littleSteps,
    );
    expect(foreign.status).toBe(404);

    const outsideSpace = await post(route, USER.rvOliver, {
      parentPostId: null,
      body: "Not my class",
    });
    expect(outsideSpace.status).toBe(404);
  });
});
