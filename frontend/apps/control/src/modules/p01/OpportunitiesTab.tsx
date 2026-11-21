import type { Opportunity } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useOpportunities } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { OPP_STAGE_KEY } from "./labels";

/** Open and closed deals with the customer. */
export function OpportunitiesTab({ accountId }: { readonly accountId: string }) {
  const t = useControlText();
  const fmt = useControlFormat();
  const opps = useOpportunities(accountId);
  const columns = useMemo<DataTableProps<Opportunity>["columns"]>(
    () => [
      { id: "title", accessorKey: "title", header: t("p01.opps.title"), meta: { primary: true } },
      {
        id: "stage",
        header: t("p01.col.stage"),
        cell: ({ row }) => {
          const stage = row.original.stage;
          const tone = stage === "won" ? "success" : stage === "lost" ? "neutral" : "info";
          return <Badge tone={tone}>{t(OPP_STAGE_KEY[stage])}</Badge>;
        },
      },
      {
        id: "value",
        accessorKey: "valueMinor",
        header: t("p01.opps.value"),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt.money(row.original.valueMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "close",
        accessorKey: "closeDate",
        header: t("p01.opps.close"),
        cell: ({ row }) => fmt.date(row.original.closeDate),
      },
    ],
    [t, fmt],
  );
  return (
    <DataTable
      caption={t("p01.opps.caption")}
      columns={columns}
      data={opps.data?.items ?? []}
      getRowId={(o) => o.id}
      loading={opps.isPending}
      error={opps.isError ? <EmptyState tone="error" /> : undefined}
    />
  );
}
