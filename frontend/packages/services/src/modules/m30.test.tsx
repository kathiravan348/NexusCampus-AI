import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useCourseItems,
  useCourseModules,
  useCourseProgress,
  useCourseSpace,
  useCourseSpaces,
  useDiscussionPosts,
  useDiscussionThreads,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

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
      expect(items.data?.total).toBe(4);
      expect(progress.data?.total).toBe(1);
      expect(threads.data?.total).toBe(1);
      expect(posts.data?.total).toBe(3);
    });
  });
});
