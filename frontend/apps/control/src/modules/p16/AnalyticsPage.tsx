import type { AccountHealth, BusinessMetrics } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useAccountHealth, useBusinessMetrics } from "@nexus/services/control";
import {
  Badge,
  DataTable,
  EmptyState,
  Skeleton,
  StatCard,
  type DataTableProps,
} from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { RISK, reasonKey } from "./labels";

/** Change from the month before, as "+3.6%" style text with a tone. */
function useDelta() {
  const t = useControlText();
  const fmt = useControlFormat();
  return (now: number, before: number | undefined, goodWhenUp = true) => {
    if (before === undefined || before === 0) return {};
    const pct = ((now - before) / before) * 100;
    const rounded = Math.round(pct * 10) / 10;
    if (rounded === 0) return { caption: t("p16.noChange") };
    const up = rounded > 0;
    return {
      caption: t(up ? "p16.up" : "p16.down", { value: fmt.number(Math.abs(rounded)) }),
      captionTone: up === goodWhenUp ? ("positive" as const) : ("negative" as const),
    };
  };
}

/** P16 Business analytics (read-only): latest month, 12-month table, AI customer health. */
export default function AnalyticsPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const delta = useDelta();
  const names = useAccountNames();
  const metrics = useBusinessMetrics();
  const health = useAccountHealth();

  const months = useMemo(
    () => [...(metrics.data?.items ?? [])].sort((a, b) => b.month.localeCompare(a.month)),
    [metrics.data],
  );
  const [latest, previous] = months;

  const healthRows = useMemo(
    () =>
      [...(health.data?.items ?? [])].sort(
        (a, b) => RISK[a.churnRisk].order - RISK[b.churnRisk].order || a.score - b.score,
      ),
    [health.data],
  );

  const monthColumns = useMemo<DataTableProps<BusinessMetrics>["columns"]>(
    () => [
      {
        id: "month",
        header: t("p16.col.month"),
        meta: { primary: true },
        enableSorting: false,
        cell: ({ row }) => fmt.month(row.original.month),
      },
      {
        id: "mrr",
        header: t("p16.mrr"),
        enableSorting: false,
        cell: ({ row }) => fmt.money(row.original.mrrMinor, row.original.currency),
      },
      {
        id: "active",
        header: t("p16.active"),
        enableSorting: false,
        cell: ({ row }) => fmt.number(row.original.activeAccounts),
      },
      {
        id: "new",
        header: t("p16.col.new"),
        enableSorting: false,
        cell: ({ row }) => fmt.number(row.original.newAccounts),
      },
      {
        id: "churned",
        header: t("p16.col.churned"),
        enableSorting: false,
        cell: ({ row }) => fmt.number(row.original.churnedAccounts),
      },
      {
        id: "nrr",
        header: t("p16.nrr"),
        enableSorting: false,
        cell: ({ row }) => t("p16.pct", { value: fmt.number(row.original.nrrPct) }),
      },
      {
        id: "tickets",
        header: t("p16.tickets"),
        enableSorting: false,
        cell: ({ row }) => fmt.number(row.original.openTickets),
      },
    ],
    [t, fmt],
  );

  const healthColumns = useMemo<DataTableProps<AccountHealth>["columns"]>(
    () => [
      {
        id: "account",
        header: t("p16.col.customer"),
        meta: { primary: true },
        enableSorting: false,
        cell: ({ row }) => names.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "score",
        header: t("p16.col.score"),
        enableSorting: false,
        cell: ({ row }) => fmt.number(row.original.score),
      },
      {
        id: "risk",
        header: t("p16.col.risk"),
        enableSorting: false,
        cell: ({ row }) => {
          const r = RISK[row.original.churnRisk];
          return <Badge tone={r.tone}>{t(r.key)}</Badge>;
        },
      },
      {
        id: "reasons",
        header: t("p16.col.reasons"),
        enableSorting: false,
        cell: ({ row }) => row.original.reasons.map((k) => t(reasonKey(k))).join("; "),
      },
    ],
    [t, fmt, names],
  );

  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p16.nav")}</h1>

      {metrics.isPending ? (
        <Skeleton className="h-32" />
      ) : metrics.isError || !latest ? (
        <EmptyState tone="error" />
      ) : (
        <section className="space-y-2">
          <h2 className="font-sans text-section-title text-text-primary">
            {t("p16.latest", { month: fmt.month(latest.month) })}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard
              label={t("p16.mrr")}
              value={fmt.money(latest.mrrMinor, latest.currency)}
              {...delta(latest.mrrMinor, previous?.mrrMinor)}
            />
            <StatCard label={t("p16.arr")} value={fmt.money(latest.arrMinor, latest.currency)} />
            <StatCard
              label={t("p16.active")}
              value={fmt.number(latest.activeAccounts)}
              {...delta(latest.activeAccounts, previous?.activeAccounts)}
            />
            <StatCard
              label={t("p16.nrr")}
              value={t("p16.pct", { value: fmt.number(latest.nrrPct) })}
            />
            <StatCard
              label={t("p16.churn")}
              value={t("p16.pct", { value: fmt.number(latest.grossChurnPct) })}
            />
            <StatCard
              label={t("p16.tickets")}
              value={fmt.number(latest.openTickets)}
              {...delta(latest.openTickets, previous?.openTickets, false)}
            />
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-sans text-section-title text-text-primary">{t("p16.months")}</h2>
        <DataTable
          caption={t("p16.months")}
          columns={monthColumns}
          data={months}
          getRowId={(m) => m.month}
          loading={metrics.isPending}
          error={metrics.isError ? <EmptyState tone="error" /> : undefined}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-sans text-section-title text-text-primary">{t("p16.health")}</h2>
        <p className="flex max-w-prose items-start gap-2 text-body-sm text-text-secondary">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-info-text" aria-hidden="true" />
          {t("p16.aiNote")}
        </p>
        <DataTable
          caption={t("p16.health")}
          columns={healthColumns}
          data={healthRows}
          getRowId={(h) => h.accountId}
          loading={health.isPending}
          error={health.isError ? <EmptyState tone="error" /> : undefined}
        />
      </section>
    </div>
  );
}
