import type { ControlUsageMetric, UsageRecord } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useUsageRecords } from "@nexus/services/control";
import { Card, EmptyState, Meter, Select, Skeleton } from "@nexus/ui-core";
import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { METRIC_KEY } from "./labels";

const METRICS = Object.keys(METRIC_KEY) as ControlUsageMetric[];

/** P11 Usage & metering: counts per account, capped ones as meters (V-4). */
export default function UsagePage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const usage = useUsageRecords();
  const accounts = useAccountNames();
  const [metric, setMetric] = useState<ControlUsageMetric | "">("");

  const groups = useMemo(() => {
    const rows = (usage.data?.items ?? []).filter((u) => !metric || u.metric === metric);
    const byAccount = new Map<string, UsageRecord[]>();
    for (const u of rows) byAccount.set(u.accountId, [...(byAccount.get(u.accountId) ?? []), u]);
    return [...byAccount.entries()];
  }, [usage.data, metric]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p11.nav")}
        </h1>
        <p className="flex items-start gap-2 text-body-sm text-text-secondary">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          {t("p11.note")}
        </p>
      </div>
      <Select
        label={t("p11.filter")}
        containerClassName="max-w-xs"
        value={metric}
        options={[
          { value: "", label: t("p11.all") },
          ...METRICS.map((m) => ({ value: m, label: t(METRIC_KEY[m]) })),
        ]}
        onChange={(e) => setMetric(e.target.value as ControlUsageMetric | "")}
      />
      {usage.isPending ? (
        <Skeleton className="h-48" />
      ) : usage.isError ? (
        <EmptyState tone="error" />
      ) : groups.length === 0 ? (
        <EmptyState description={t("p11.empty")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {groups.map(([accountId, records]) => (
            <li key={accountId}>
              <Card headingAs="h2" title={accounts.get(accountId) ?? accountId}>
                <ul className="space-y-4">
                  {records.map((u) => {
                    const used = fmt.number(u.quantity);
                    const source = u.tenantId
                      ? t("p11.source.tenant", { id: u.tenantId })
                      : t("p11.source.install", { id: u.deploymentId ?? "" });
                    const period = t("p11.period", {
                      start: fmt.date(u.periodStart),
                      end: fmt.date(u.periodEnd),
                    });
                    return (
                      <li key={u.id}>
                        {u.cap !== null ? (
                          <Meter
                            label={t(METRIC_KEY[u.metric])}
                            value={u.quantity}
                            max={u.cap}
                            valueText={t("p11.valueOfCap", { used, cap: fmt.number(u.cap) })}
                            description={`${source} · ${period}`}
                          />
                        ) : (
                          <div className="space-y-0.5">
                            <p className="text-label text-text-primary">
                              {t(METRIC_KEY[u.metric])}
                            </p>
                            <p className="text-body tabular-nums text-text-primary">
                              {t("p11.noCap", { used })}
                            </p>
                            <p className="text-body-sm text-text-secondary">
                              {source} · {period}
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
