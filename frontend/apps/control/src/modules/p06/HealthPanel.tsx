import type { Deployment, HealthSignal } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { Card, EmptyState, StatCard } from "@nexus/ui-core";
import { ShieldCheck } from "lucide-react";
import { useControlFormat } from "../../app/format";

/** One deployment's latest check-in: counts, rates and timings only (V-4). */
export function HealthPanel({
  deployment,
  signal,
}: {
  readonly deployment: Deployment;
  readonly signal: HealthSignal | undefined;
}) {
  const t = useControlText();
  const fmt = useControlFormat();
  const pct = (value: number) => t("p06.pct", { value: fmt.number(value) });

  return (
    <Card headingAs="h2" title={t("p06.panel.title", { name: deployment.name })}>
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-body-sm text-text-secondary">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          {t("p06.panel.note")}
        </p>
        {signal ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard label={t("p06.metric.uptime")} value={pct(signal.uptimePct)} />
            <StatCard label={t("p06.metric.errors")} value={pct(signal.errorRatePct)} />
            <StatCard
              label={t("p06.metric.p95")}
              value={t("p06.ms", { value: fmt.number(signal.p95LatencyMs) })}
            />
            <StatCard label={t("p06.metric.queue")} value={fmt.number(signal.queueDepth)} />
            <StatCard label={t("p06.metric.disk")} value={pct(signal.diskUsedPct)} />
            <StatCard label={t("p06.metric.users")} value={fmt.number(signal.activeUsers)} />
          </div>
        ) : (
          <EmptyState
            description={deployment.airGapped ? t("p06.airGapped") : t("p06.panel.none")}
          />
        )}
      </div>
    </Card>
  );
}
