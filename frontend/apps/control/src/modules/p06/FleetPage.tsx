import type { Deployment } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useDeployments, useHealthSignals } from "@nexus/services/control";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  StatCard,
  type DataTableProps,
} from "@nexus/ui-core";
import { useMemo, useState } from "react";
import { useControlFormat } from "../../app/format";
import { HealthPanel } from "./HealthPanel";
import { CHANNEL_KEY, HEALTH, HEALTH_ORDER, KIND_KEY } from "./labels";

/** P06 Deployment registry & fleet health (read-only). */
export default function FleetPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const deployments = useDeployments();
  const signals = useHealthSignals();
  const [selected, setSelected] = useState<string | null>(null);
  const items = useMemo(() => deployments.data?.items ?? [], [deployments.data]);
  const chosen = items.find((d) => d.id === selected);

  const columns = useMemo<DataTableProps<Deployment>["columns"]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t("p06.col.name"),
        meta: { primary: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "kind",
        header: t("p06.col.kind"),
        enableSorting: false,
        cell: ({ row }) => t(KIND_KEY[row.original.kind]),
      },
      {
        id: "version",
        accessorKey: "version",
        header: t("p06.col.version"),
        cell: ({ row }) =>
          t("p06.versionChannel", {
            version: row.original.version,
            channel: t(CHANNEL_KEY[row.original.channel]),
          }),
      },
      {
        id: "health",
        header: t("p06.col.health"),
        enableSorting: false,
        cell: ({ row }) => {
          const h = HEALTH[row.original.health];
          return <Badge tone={h.tone}>{t(h.key)}</Badge>;
        },
      },
      {
        id: "checkIn",
        header: t("p06.col.checkIn"),
        enableSorting: false,
        cell: ({ row }) => {
          const d = row.original;
          if (d.airGapped) return <span className="text-text-secondary">{t("p06.airGapped")}</span>;
          if (!d.telemetryEnabled)
            return <span className="text-text-secondary">{t("p06.telemetryOff")}</span>;
          return d.lastCheckInAt ? fmt.date(d.lastCheckInAt) : t("p01.none");
        },
      },
      {
        id: "tenants",
        accessorKey: "tenantCount",
        header: t("p06.col.tenants"),
        cell: ({ row }) => (
          <span className="tabular-nums">{fmt.number(row.original.tenantCount)}</span>
        ),
      },
      {
        id: "show",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            aria-label={t("p06.showLabel", { name: row.original.name })}
            onClick={() => setSelected(row.original.id)}
          >
            {t("p06.show")}
          </Button>
        ),
      },
    ],
    [t, fmt],
  );

  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p06.nav")}</h1>
      <section aria-label={t("p06.summaryLabel")} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {HEALTH_ORDER.map((h) => (
          <StatCard
            key={h}
            label={t(HEALTH[h].key)}
            value={t("p06.count", { count: items.filter((d) => d.health === h).length })}
            loading={deployments.isPending}
          />
        ))}
      </section>
      <DataTable
        caption={t("p06.caption")}
        columns={columns}
        data={items}
        getRowId={(d) => d.id}
        loading={deployments.isPending}
        error={deployments.isError ? <EmptyState tone="error" /> : undefined}
      />
      {chosen && (
        <HealthPanel
          deployment={chosen}
          signal={signals.data?.items.find((s) => s.deploymentId === chosen.id)}
        />
      )}
    </div>
  );
}
