import type { TextOverride } from "@nexus/contracts";
import {
  formatDateTime,
  getDirection,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { useRevisions, useRollbackOverride } from "@nexus/services";
import { Badge, Button, EmptyState, Skeleton, useToast } from "@nexus/ui-core";
import { History, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";

export interface HistoryPanelProps {
  readonly messageKey: MessageKey;
  readonly locale: string;
  readonly lockedByGroup: boolean;
  readonly online: boolean;
  readonly onRolledBack?: (override: TextOverride | null) => void;
}

/** Shows saved revisions for one message key and lets admins roll back to an earlier version. */
export function HistoryPanel({
  messageKey,
  locale,
  lockedByGroup,
  online,
  onRolledBack,
}: HistoryPanelProps) {
  const t = useText();
  const toast = useToast();
  const { locale: uiLocale, timeZone } = useRuntime();
  const revisionsQuery = useRevisions(messageKey, locale);
  const rollback = useRollbackOverride();

  const sorted = useMemo(
    () => [...(revisionsQuery.data?.items ?? [])].sort((a, b) => b.version - a.version),
    [revisionsQuery.data],
  );
  const latestVersion = sorted[0]?.version ?? null;
  const textDir = getDirection(locale);
  const dateLocale = isPseudoLocale(uiLocale) ? SOURCE_LOCALE : uiLocale;

  const handleRollback = async (version: number) => {
    try {
      const result = await rollback.mutateAsync({ key: messageKey, locale, version });
      if (result.queued) {
        toast.show({ tone: "warning", title: t("m04.studio.offlineNotice") });
        return;
      }
      toast.show({ tone: "success", title: t("m04.history.rolledBackToast", { version }) });
      onRolledBack?.(result.data.override);
    } catch {
      toast.show({ tone: "danger", title: t("m04.history.rollbackFailedToast") });
    }
  };

  return (
    <section
      aria-labelledby="m04-history-heading"
      className="space-y-3 border-t border-border-default pt-4"
    >
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <h3
          id="m04-history-heading"
          className="font-sans text-body-sm font-semibold text-text-primary"
        >
          {t("m04.history.heading")}
        </h3>
      </div>

      {revisionsQuery.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : revisionsQuery.isError ? (
        <EmptyState
          tone="error"
          title={t("m04.history.error")}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void revisionsQuery.refetch()}
            >
              {t("common.retry")}
            </Button>
          }
        />
      ) : sorted.length === 0 ? (
        <p className="text-body-sm text-text-muted">{t("m04.history.empty")}</p>
      ) : (
        <ol className="space-y-2">
          {sorted.map((rev) => {
            const isCurrent = rev.version === latestVersion;
            return (
              <li
                key={`${rev.overrideId}-${rev.version}`}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border-default bg-bg-raised p-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isCurrent ? "brand" : "neutral"}>
                      {t("m04.history.version", { version: rev.version })}
                    </Badge>
                    {isCurrent && <Badge tone="info">{t("m04.history.current")}</Badge>}
                    <span className="text-body-sm text-text-muted">
                      {formatDateTime(rev.changedAt, { locale: dateLocale, timeZone })}
                    </span>
                  </div>
                  {rev.message === null ? (
                    <Badge tone="warning">{t("m04.history.removed")}</Badge>
                  ) : (
                    <p dir={textDir} className="break-words text-body-sm text-text-primary">
                      {rev.message}
                    </p>
                  )}
                </div>

                {!isCurrent && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!online || lockedByGroup || rollback.isPending}
                    onClick={() => void handleRollback(rev.version)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("m04.history.rollback")}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
