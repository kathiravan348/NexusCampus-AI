import {
  CourseItemSchema,
  CourseModuleSchema,
  CourseProgressSchema,
  CourseSpaceSchema,
  DiscussionPostSchema,
  DiscussionThreadSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const CourseSpacePage = pageSchema(CourseSpaceSchema);
const CourseModulePage = pageSchema(CourseModuleSchema);
const CourseItemPage = pageSchema(CourseItemSchema);
const CourseProgressPage = pageSchema(CourseProgressSchema);
const DiscussionThreadPage = pageSchema(DiscussionThreadSchema);
const DiscussionPostPage = pageSchema(DiscussionPostSchema);

export function useCourseSpaces() {
  return useScopedQuery(queryKeys.m30.courseSpaces, (c, signal) =>
    c.get("/course-spaces", CourseSpacePage, all, { signal }),
  );
}

export function useCourseSpace(courseSpaceId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m30.courseSpace(s, courseSpaceId),
    (c, signal) =>
      c.get(
        `/course-spaces/${encodeURIComponent(courseSpaceId ?? "")}`,
        CourseSpaceSchema,
        undefined,
        { signal },
      ),
    courseSpaceId !== null,
  );
}

export function useCourseModules(courseSpaceId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m30.courseModules(s, courseSpaceId),
    (c, signal) =>
      c.get(
        `/course-spaces/${encodeURIComponent(courseSpaceId ?? "")}/modules`,
        CourseModulePage,
        all,
        { signal },
      ),
    courseSpaceId !== null,
  );
}

export function useCourseItems(courseSpaceId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m30.courseItems(s, courseSpaceId),
    (c, signal) =>
      c.get(
        `/course-spaces/${encodeURIComponent(courseSpaceId ?? "")}/items`,
        CourseItemPage,
        all,
        { signal },
      ),
    courseSpaceId !== null,
  );
}

export function useCourseProgress(courseSpaceId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m30.courseProgress(s, courseSpaceId),
    (c, signal) =>
      c.get(
        `/course-spaces/${encodeURIComponent(courseSpaceId ?? "")}/progress`,
        CourseProgressPage,
        all,
        { signal },
      ),
    courseSpaceId !== null,
  );
}

export function useDiscussionThreads(courseSpaceId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m30.discussionThreads(s, courseSpaceId),
    (c, signal) =>
      c.get(
        `/course-spaces/${encodeURIComponent(courseSpaceId ?? "")}/threads`,
        DiscussionThreadPage,
        all,
        { signal },
      ),
    courseSpaceId !== null,
  );
}

export function useDiscussionPosts(threadId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m30.discussionPosts(s, threadId),
    (c, signal) =>
      c.get(`/threads/${encodeURIComponent(threadId ?? "")}/posts`, DiscussionPostPage, all, {
        signal,
      }),
    threadId !== null,
  );
}
