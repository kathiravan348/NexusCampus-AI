import type { MessageThread, MessageThreadKind } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { Badge, EmptyState } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

export const THREAD_KIND_KEYS: Readonly<Record<MessageThreadKind, MessageKey>> = {
  direct: "m24.kind.direct",
  class_group: "m24.kind.classGroup",
  staff_group: "m24.kind.staffGroup",
  broadcast: "m24.kind.broadcast",
};

export interface ThreadListProps {
  readonly threads: readonly MessageThread[];
  readonly onOpen: (threadId: string) => void;
}

function activityTime(thread: MessageThread): number {
  return Date.parse(thread.lastMessageAt ?? thread.updatedAt);
}

export function ThreadList({ threads, onOpen }: ThreadListProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const sorted = [...threads].sort(
    (a, b) => activityTime(b) - activityTime(a) || a.id.localeCompare(b.id),
  );

  if (sorted.length === 0) {
    return <EmptyState title={t("m24.threads.empty")} />;
  }

  return (
    <ul aria-label={t("m24.threads.listLabel")} className="space-y-3">
      {sorted.map((thread) => (
        <li key={thread.id} className="rounded-lg border border-border-default bg-bg-surface">
          <button
            type="button"
            onClick={() => onOpen(thread.id)}
            className="flex min-h-11 w-full flex-col items-start gap-2 break-words rounded-lg p-4 text-start text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="break-words font-semibold text-text-primary">{thread.subject}</p>
              <p className="text-body-sm text-text-secondary">{t(THREAD_KIND_KEYS[thread.kind])}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
              {thread.lastMessageAt !== null ? (
                <time dateTime={thread.lastMessageAt}>
                  {formatDate(thread.lastMessageAt, { locale: safeLocale, timeZone })}
                </time>
              ) : (
                <span>{t("m24.threads.noMessages")}</span>
              )}
              {thread.archived && <Badge tone="neutral">{t("m24.threads.archived")}</Badge>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
