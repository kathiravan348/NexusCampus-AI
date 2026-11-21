import type { Contract } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useContracts } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { CONTRACT_KEY, CONTRACT_STATUS_KEY, SLA_KEY } from "./labels";

/** Signed agreements: SaaS subscriptions, licences and support contracts. */
export function ContractsTab({ accountId }: { readonly accountId: string }) {
  const t = useControlText();
  const fmt = useControlFormat();
  const contracts = useContracts(accountId);
  const columns = useMemo<DataTableProps<Contract>["columns"]>(
    () => [
      {
        id: "kind",
        header: t("p01.contracts.kind"),
        meta: { primary: true },
        cell: ({ row }) => t(CONTRACT_KEY[row.original.kind]),
      },
      {
        id: "term",
        header: t("p01.contracts.term"),
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original;
          return c.endDate
            ? t("p01.contracts.termRange", {
                start: fmt.date(c.startDate),
                end: fmt.date(c.endDate),
              })
            : t("p01.contracts.perpetual", { start: fmt.date(c.startDate) });
        },
      },
      {
        id: "value",
        accessorKey: "valueMinor",
        header: t("p01.contracts.value"),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt.money(row.original.valueMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "sla",
        header: t("p01.contracts.sla"),
        enableSorting: false,
        cell: ({ row }) => t(SLA_KEY[row.original.slaTier]),
      },
      {
        id: "status",
        header: t("p01.col.stage"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={row.original.status === "active" ? "success" : "neutral"}>
            {t(CONTRACT_STATUS_KEY[row.original.status])}
          </Badge>
        ),
      },
    ],
    [t, fmt],
  );
  return (
    <DataTable
      caption={t("p01.contracts.caption")}
      columns={columns}
      data={contracts.data?.items ?? []}
      getRowId={(c) => c.id}
      loading={contracts.isPending}
      error={contracts.isError ? <EmptyState tone="error" /> : undefined}
    />
  );
}
