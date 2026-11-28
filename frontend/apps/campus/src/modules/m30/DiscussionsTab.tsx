import type { DiscussionPost, DiscussionThread } from "@nexus/contracts";
import { formatDateTime, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { useDiscussionPosts, useDiscussionThreads } from "@nexus/services";
import { Badge, Button, Card, cn, EmptyState, Skeleton } from "@nexus/ui-core";
import { EyeOff, Lock, MessageSquare, Pin, Reply } from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { ReplyForm } from "./ReplyForm";

const MAX_INDENT_DEPTH = 3;

export interface DiscussionsTabProps {
  readonly courseSpaceId: string;
  readonly canModerate: boolean;
  readonly ownProfileIds: ReadonlySet<string>;
}

function compareThreads(a: DiscussionThread, b: DiscussionThread): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const aTime = Date.parse(a.lastPostAt ?? a.createdAt);
  const bTime = Date.parse(b.lastPostAt ?? b.createdAt);
  if (bTime !== aTime) return bTime - aTime;
  return a.id.localeCompare(b.id);
}

interface PostTree {
  readonly roots: readonly DiscussionPost[];
  readonly childrenByParent: ReadonlyMap<string, readonly DiscussionPost[]>;
}

function buildPostTree(posts: readonly DiscussionPost[]): PostTree {
  const ordered = [...posts].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const byId = new Set(ordered.map((post) => post.id));
  const roots: DiscussionPost[] = [];
  const children = new Map<string, DiscussionPost[]>();

  for (const post of ordered) {
    if (post.parentPostId !== null && byId.has(post.parentPostId)) {
      const list = children.get(post.parentPostId);
      if (list) list.push(post);
      else children.set(post.parentPostId, [post]);
    } else {
      roots.push(post);
    }
  }
  return { roots, childrenByParent: children };
}

/**
 * Course discussions tab: pinned-first thread list, nested post tree by parentPostId,
 * moderator-only hidden posts, and inline/thread reply forms hidden on locked threads.
 */
export function DiscussionsTab({ courseSpaceId, canModerate, ownProfileIds }: DiscussionsTabProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const threads = useDiscussionThreads(courseSpaceId);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyingToPostId, setReplyingToPostId] = useState<string | null>(null);

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  const sortedThreads = useMemo(
    () => [...(threads.data?.items ?? [])].sort(compareThreads),
    [threads.data?.items],
  );
  const activeThread = useMemo(
    () => sortedThreads.find((row) => row.id === selectedThreadId) ?? sortedThreads[0] ?? null,
    [sortedThreads, selectedThreadId],
  );

  const posts = useDiscussionPosts(activeThread?.id ?? null);
  const tree = useMemo(() => {
    const visible = (posts.data?.items ?? []).filter((post) => canModerate || !post.hidden);
    return buildPostTree(visible);
  }, [posts.data?.items, canModerate]);

  if (threads.isPending && !threads.data) {
    return (
      <div className="space-y-3" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (threads.isError && !threads.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m30.discussions.error")}
        action={
          <Button variant="secondary" onClick={() => void threads.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  if (!activeThread) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-6 w-6" />}
        title={t("m30.discussions.empty")}
        description={t("m30.discussions.emptyBody")}
      />
    );
  }

  const renderNode = (post: DiscussionPost, depth: number, visited: Set<string>) => {
    if (visited.has(post.id)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(post.id);
    const children = tree.childrenByParent.get(post.id) ?? [];
    const authorLabel = ownProfileIds.has(post.authorProfileId)
      ? t("m30.discussions.you")
      : t("m30.discussions.participant");
    const isReplying = !activeThread.locked && replyingToPostId === post.id;

    return (
      <li key={post.id} className="min-w-0">
        <article className="space-y-2 rounded-md border border-border-default bg-bg-raised p-3">
          <div className="flex flex-wrap items-center gap-2 text-body-sm">
            <span className="font-semibold text-text-primary">{authorLabel}</span>
            <time dateTime={post.createdAt} className="text-text-muted">
              {formatDateTime(post.createdAt, { locale: safeLocale, timeZone })}
            </time>
            {post.editedAt !== null && <Badge tone="neutral">{t("m30.discussions.edited")}</Badge>}
            {post.hidden && (
              <Badge tone="warning">
                <EyeOff className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{t("m30.discussions.hidden")}</span>
              </Badge>
            )}
          </div>
          <p className="whitespace-pre-wrap break-words text-body text-text-primary">{post.body}</p>
          {!activeThread.locked && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setReplyingToPostId((current) => (current === post.id ? null : post.id))
                }
              >
                <Reply className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{t("m30.discussions.replyAction")}</span>
              </Button>
            </div>
          )}
          {isReplying && (
            <div className="border-t border-border-default pt-3">
              <ReplyForm
                key={post.id}
                threadId={activeThread.id}
                courseSpaceId={courseSpaceId}
                parentPostId={post.id}
                onSuccess={() => setReplyingToPostId(null)}
                onCancel={() => setReplyingToPostId(null)}
              />
            </div>
          )}
        </article>
        {children.length > 0 && (
          <ul
            className={cn(
              "mt-2 space-y-2 border-s-2 border-border-default",
              depth < MAX_INDENT_DEPTH ? "ms-2 ps-3" : "ps-2",
            )}
          >
            {children.map((child) => renderNode(child, depth + 1, nextVisited))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <ul aria-label={t("m30.discussions.threadsLabel")} className="space-y-2 lg:col-span-1">
        {sortedThreads.map((thread) => {
          const selected = thread.id === activeThread.id;
          return (
            <li key={thread.id} className="min-w-0">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setSelectedThreadId(thread.id);
                  setReplyingToPostId(null);
                }}
                className={cn(
                  "w-full cursor-pointer space-y-2 rounded-lg border p-3 text-start transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
                  selected
                    ? "border-brand-primary bg-brand-primary-subtle"
                    : "border-border-default bg-bg-surface hover:bg-bg-raised",
                )}
              >
                <p className="break-words font-sans text-body font-semibold text-text-primary">
                  {thread.title}
                </p>
                {(thread.pinned || thread.locked) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {thread.pinned && (
                      <Badge tone="brand">
                        <Pin className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{t("m30.discussions.pinned")}</span>
                      </Badge>
                    )}
                    {thread.locked && (
                      <Badge tone="warning">
                        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{t("m30.discussions.locked")}</span>
                      </Badge>
                    )}
                  </div>
                )}
                <p className="text-body-sm text-text-secondary">
                  {t("m30.discussions.postCount", { count: thread.postCount })}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="min-w-0 lg:col-span-2">
        <Card
          headingAs="h3"
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="break-words">{activeThread.title}</span>
              {activeThread.pinned && (
                <Badge tone="brand">
                  <Pin className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{t("m30.discussions.pinned")}</span>
                </Badge>
              )}
              {activeThread.locked && (
                <Badge tone="warning">
                  <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{t("m30.discussions.locked")}</span>
                </Badge>
              )}
            </span>
          }
        >
          <div className="space-y-4">
            {posts.isPending && !posts.data ? (
              <div className="space-y-3" role="status" aria-label={t("common.loading")}>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : posts.isError && !posts.data ? (
              <EmptyState
                tone="error"
                title={t("m30.discussions.postsError")}
                action={
                  <Button variant="secondary" onClick={() => void posts.refetch()}>
                    {t("common.retry")}
                  </Button>
                }
              />
            ) : tree.roots.length === 0 ? (
              <p className="text-body-sm text-text-muted">{t("m30.discussions.noPosts")}</p>
            ) : (
              <ul aria-label={t("m30.discussions.postsLabel")} className="space-y-3">
                {tree.roots.map((post) => renderNode(post, 0, new Set()))}
              </ul>
            )}

            <div className="border-t border-border-default pt-4">
              {activeThread.locked ? (
                <p className="inline-flex items-center gap-2 text-body-sm text-text-secondary">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t("m30.discussions.lockedNote")}</span>
                </p>
              ) : (
                <ReplyForm
                  key={activeThread.id}
                  threadId={activeThread.id}
                  courseSpaceId={courseSpaceId}
                  parentPostId={null}
                />
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
