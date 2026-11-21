import type { SlaPolicy } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useSlaPolicies } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { SLA_KEY } from "../p01/labels";

/** Response and resolution targets per support tier. */
export function SlaTable() {
  const t = useControlText();
  const fmt = useControlFormat();
  const policies = useSlaPolicies();

  const columns = useMemo<DataTableProps<SlaPolicy>["columns"]>(() => {
    const hours = (minutes: number) => t("p09.sla.hours", { value: fmt.number(minutes / 60) });
    const row = (m: SlaPolicy["firstResponseMinutes"]) =>
      t("p09.sla.perPriority", {
        p1: hours(m.p1),
        p2: hours(m.p2),
        p3: hours(m.p3),
        p4: hours(m.p4),
      });
    return [
      {
        id: "tier",
        header: t("p09.sla.tier"),
        meta: { primary: true },
        enableSorting: false,
        cell: ({ row: r }) => (
          <span className="flex items-center gap-2">
            {t(SLA_KEY[r.original.slaTier])}
            {r.original.twentyFourSeven && <Badge tone="info">{t("p09.sla.allDay")}</Badge>}
          </span>
        ),
      },
      {
        id: "first",
        header: t("p09.sla.firstResponse"),
        enableSorting: false,
        cell: ({ row: r }) => row(r.original.firstResponseMinutes),
      },
      {
        id: "resolution",
        header: t("p09.sla.resolution"),
        enableSorting: false,
        cell: ({ row: r }) => row(r.original.resolutionMinutes),
      },
    ];
  }, [t, fmt]);

  return (
    <section className="space-y-2">
      <h2 className="font-sans text-section-title text-text-primary">{t("p09.sla.title")}</h2>
      <DataTable
        caption={t("p09.sla.caption")}
        columns={columns}
        data={policies.data?.items ?? []}
        getRowId={(p) => p.slaTier}
        loading={policies.isPending}
        error={policies.isError ? <EmptyState tone="error" /> : undefined}
      />
    </section>
  );
}
