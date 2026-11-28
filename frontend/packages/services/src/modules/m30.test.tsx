import { COURSE_SPACE, DISCUSSION_THREAD, TENANT, USER, resetMockDb } from "@nexus/mocks";
import { listOutbox } from "@nexus/offline";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useCourseItems,
  useCourseModules,
  useCourseProgress,
  useCourseSpace,
  useCourseSpaces,
  useCreateDiscussionPost,
  useDiscussionPosts,
  useDiscussionThreads,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => {
  vi.restoreAllMocks();
  resetMockDb();
});

describe("M30 hooks", () => {
  it("loads a course space, its related pages and discussion posts", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const spaces = useCourseSpaces();
        const spaceId = spaces.data?.items.find((row) => row.code === "RV-Y5-MATH")?.id ?? null;
        const threads = useDiscussionThreads(spaceId);
        const threadId = threads.data?.items[0]?.id ?? null;
        return {
          spaces,
          threads,
          space: useCourseSpace(spaceId),
          modules: useCourseModules(spaceId),
          items: useCourseItems(spaceId),
          progress: useCourseProgress(spaceId),
          posts: useDiscussionPosts(threadId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { spaces, space, modules, items, progress, threads, posts } = result.current;
      expect(spaces.data?.total).toBe(8);
      expect(space.data?.code).toBe("RV-Y5-MATH");
      expect(modules.data?.total).toBe(3);
      expect(items.data?.total).toBe(6);
      expect(progress.data?.total).toBe(1);
      expect(threads.data?.total).toBe(1);
      expect(posts.data?.total).toBe(3);
    });
  });

  it("posts a discussion reply online and invalidates the thread posts", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvAmira });
    const { result } = renderHook(
      () => ({
        threads: useDiscussionThreads(COURSE_SPACE.rvY5Math),
        posts: useDiscussionPosts(DISCUSSION_THREAD.rvMathQna),
        create: useCreateDiscussionPost(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => expect(result.current.posts.data?.total).toBe(3));

    await act(async () => {
      const res = await result.current.create.mutateAsync({
        threadId: DISCUSSION_THREAD.rvMathQna,
        courseSpaceId: COURSE_SPACE.rvY5Math,
        input: { parentPostId: null, body: "Try simplifying both terms." },
      });
      expect(res.queued).toBe(false);
    });

    await waitFor(() => {
      const bodies = (result.current.posts.data?.items ?? []).map((row) => row.body);
      expect(bodies).toContain("Try simplifying both terms.");
      expect(result.current.threads.data?.items[0]?.postCount).toBe(4);
    });
  });

  it("queues a discussion reply offline and syncs when back online", async () => {
    const scope = { tenantId: TENANT.riverside, userId: USER.rvAmira };
    signInAs({ ...ADMIN, ...scope });
    const onlineSpy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const db = freshDb();
    const { result } = renderHook(
      () => ({
        posts: useDiscussionPosts(DISCUSSION_THREAD.rvMathQna),
        create: useCreateDiscussionPost(),
      }),
      { wrapper: wrapper({ db }) },
    );

    await act(async () => {
      const outcome = await result.current.create.mutateAsync({
        threadId: DISCUSSION_THREAD.rvMathQna,
        courseSpaceId: COURSE_SPACE.rvY5Math,
        input: { parentPostId: null, body: "Offline queued reply" },
      });
      expect(outcome.queued).toBe(true);
    });

    const queued = await listOutbox(db, scope);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      moduleId: "M30",
      operation: "discussion.post",
      mergeRule: "append-only",
    });

    onlineSpy.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(async () => expect(await listOutbox(db, scope)).toHaveLength(0));
    await waitFor(() => {
      const bodies = (result.current.posts.data?.items ?? []).map((row) => row.body);
      expect(bodies).toContain("Offline queued reply");
    });
  });
});
