import type { UsageMeter, UsageMetric } from "@nexus/contracts";
import {
  formatDate,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { useUsage } from "@nexus/services";
import { Button, Card, EmptyState, Meter } from "@nexus/ui-core";
import { Gauge } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";

const METRIC_KEY: Readonly<Record<UsageMetric, MessageKey>> = {
  learners: "m05.metric.learners",
  staff: "m05.metric.staff",
  storage_bytes: "m05.metric.storage",
  ai_credits: "m05.metric.aiCredits",
  sms: "m05.metric.sms",
  email: "m05.metric.email",
};

const GB = 1024 ** 3;

/** One meter per usage metric this billing period, with limits and 80 % / 100 % warnings. */
export function UsageTab() {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const usage = useUsage();
  const fmtLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  const amount = (m: UsageMeter, value: number) =>
    m.metric === "storage_bytes"
      ? t("m05.usage.gigabytes", {
          value: formatNumber(value / GB, fmtLocale, { maximumFractionDigits: 2 }),
        })
      : formatNumber(value, fmtLocale);

  const valueText = (m: UsageMeter) =>
    m.limit === null
      ? amount(m, m.used)
      : t("m05.usage.ofLimit", { used: amount(m, m.used), limit: amount(m, m.limit) });

  if (usage.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m05.plan.error")}
        action={
          <Button variant="secondary" onClick={() => void usage.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const meters = usage.data?.items ?? [];
  if (!usage.isPending && meters.length === 0) {
    return <EmptyState icon={<Gauge className="h-6 w-6" />} title={t("m05.usage.empty")} />;
  }

  const period = meters[0];
  return (
    <Card
      title={t("m05.usage.title")}
      actions={
        period && (
          <span className="font-mono text-number-sm tabular-nums text-text-secondary">
            {t("m05.usage.period", {
              from: formatDate(period.periodStart, { locale: fmtLocale, timeZone }),
              to: formatDate(period.periodEnd, { locale: fmtLocale, timeZone }),
            })}
          </span>
        )
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {usage.isPending
          ? [0, 1, 2, 3].map((i) => (
              <Meter key={i} label="" value={0} max={1} valueText="" loading />
            ))
          : meters.map((m) => (
              <Meter
                key={m.metric}
                label={t(METRIC_KEY[m.metric])}
                value={m.used}
                max={m.limit}
                valueText={valueText(m)}
              />
            ))}
      </div>
    </Card>
  );
}
