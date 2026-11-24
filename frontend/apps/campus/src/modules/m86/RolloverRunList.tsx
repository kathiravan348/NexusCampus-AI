import { PromotionActionSchema, type RolloverRun } from "@nexus/contracts";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { Badge } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

const statusLabels: Record<RolloverRun["status"], MessageKey> = {
  draft: "m86.status.draft",
  dry_run_ready: "m86.status.dryRunReady",
  running: "m86.status.running",
  completed: "m86.status.completed",
  rolled_back: "m86.status.rolledBack",
  failed: "m86.status.failed",
};

interface Props {
  readonly runs: readonly RolloverRun[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}

export function RolloverRunList({ runs, selectedId, onSelect }: Props) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const local = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  return (
    <section aria-labelledby="rollover-runs" className="space-y-3">
      <h2 id="rollover-runs" className="font-semibold text-text-primary">
        {t("m86.run.heading")}
      </h2>
      <ul className="grid gap-3 lg:grid-cols-2">
        {runs.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              aria-pressed={run.id === selectedId}
              onClick={() => onSelect(run.id)}
              className="grid min-h-11 w-full gap-3 rounded-lg border border-border-default bg-bg-surface p-4 text-start text-text-primary aria-pressed:border-brand-primary aria-pressed:ring-1 aria-pressed:ring-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {t("m86.run.created", {
                    date: formatDate(run.createdAt, { locale: local, timeZone }),
                  })}
                </span>
                <Badge tone="neutral">{t(statusLabels[run.status])}</Badge>
              </span>
              <span className="grid grid-cols-2 gap-2 text-body-sm">
                {PromotionActionSchema.options.map((action) => (
                  <span key={action} className="flex flex-wrap items-baseline gap-x-2">
                    <span>{t(`m86.action.${action}`)}</span>
                    <strong>{formatNumber(run.counts[action], local)}</strong>
                  </span>
                ))}
              </span>
              <span className="flex flex-wrap gap-x-2 text-body-sm text-text-secondary">
                <span>{t("m86.run.fees")}</span>
                <span>{t(run.carryForwardFees ? "m86.run.yes" : "m86.run.no")}</span>
              </span>
              {run.status === "completed" && run.rollbackUntil && (
                <span className="text-body-sm text-text-secondary">
                  {t("m86.run.rollback", {
                    date: formatDateTime(run.rollbackUntil, { locale: local, timeZone }),
                  })}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
