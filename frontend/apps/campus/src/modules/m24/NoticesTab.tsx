import type { NoticeStatus } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useNotices } from "@nexus/services";
import { Badge, Button, EmptyState, type BadgeProps } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

const NOTICE_STATUS: Readonly<Record<NoticeStatus, readonly [MessageKey, BadgeTone]>> = {
  draft: ["m24.noticeStatus.draft", "neutral"],
  scheduled: ["m24.noticeStatus.scheduled", "info"],
  published: ["m24.noticeStatus.published", "success"],
  withdrawn: ["m24.noticeStatus.withdrawn", "warning"],
};

export interface NoticesTabProps {
  readonly canPublish: boolean;
}

export function NoticesTab({ canPublish }: NoticesTabProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const notices = useNotices();

  if (notices.isError && !notices.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m24.notices.error")}
        action={
          <Button className="min-h-11" variant="secondary" onClick={() => void notices.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!notices.data) {
    return <p role="status">{t("common.loading")}</p>;
  }

  const sorted = [...notices.data.items].sort(
    (a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt) || a.id.localeCompare(b.id),
  );

  if (sorted.length === 0) {
    return <EmptyState title={t("m24.notices.empty")} />;
  }

  return (
    <ul aria-label={t("m24.notices.listLabel")} className="space-y-4">
      {sorted.map((notice) => {
        const [statusKey, statusTone] = NOTICE_STATUS[notice.status];
        return (
          <li
            key={notice.id}
            className="min-w-0 space-y-2 rounded-lg border border-border-default bg-bg-surface p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-card-title font-semibold break-words text-text-primary">
                {notice.title}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {notice.requiresAcknowledgement && (
                  <Badge tone="warning">{t("m24.notices.needsAck")}</Badge>
                )}
                {canPublish && <Badge tone={statusTone}>{t(statusKey)}</Badge>}
              </div>
            </div>
            <p className="text-body-sm text-text-secondary">
              <time dateTime={notice.publishAt}>
                {formatDate(notice.publishAt, { locale: safeLocale, timeZone })}
              </time>
            </p>
            <p className="whitespace-pre-wrap break-words text-body text-text-primary">
              {notice.body}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
