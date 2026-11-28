import {
  CourseItemSchema,
  CourseModuleSchema,
  CourseProgressSchema,
  CourseSpaceSchema,
  DiscussionPostSchema,
  DiscussionThreadSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type DiscussionPost,
  type DiscussionPostInput,
} from "@nexus/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery } from "../query";
import { useSession } from "../session";

export interface CreateDiscussionPostInput {
  readonly threadId: string;
  readonly courseSpaceId?: string;
  readonly input: DiscussionPostInput;
}

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

/** Posts a reply via `POST /threads/:id/posts` (M30, L2 outbox write). */
export function useCreateDiscussionPost() {
  const { session } = useSession();
  const qc = useQueryClient();

  return useOutboxMutation<CreateDiscussionPostInput, DiscussionPost>({
    moduleId: "M30",
    operation: "discussion.post",
    mergeRule: "append-only",
    send: async (client, { threadId, courseSpaceId, input }, idempotencyKey) => {
      const post = await client.send(
        "POST",
        `/threads/${encodeURIComponent(threadId)}/posts`,
        input,
        DiscussionPostSchema,
        { headers: idempotencyHeaders(idempotencyKey) },
      );
      if (session) {
        await qc.invalidateQueries({ queryKey: queryKeys.m30.discussionPosts(session, threadId) });
        if (courseSpaceId) {
          await qc.invalidateQueries({
            queryKey: queryKeys.m30.discussionThreads(session, courseSpaceId),
          });
        }
      }
      return post;
    },
  });
}
