import type { DunningState } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useDunning } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { DUNNING } from "./labels";

/** Overdue reminders. They end at read-only access for the institution — never deletion (D23). */
export function DunningTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const dunning = useDunning();
  const accounts = useAccountNames();

  const columns = useMemo<DataTableProps<DunningState>["columns"]>(
    () => [
      {
        id: "account",
        header: t("p03.col.account"),
        meta: { primary: true },
        cell: ({ row }) => accounts.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "stage",
        header: t("p03.dun.stage"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = DUNNING[row.original.stage];
          return <Badge tone={s.tone}>{t(s.key)}</Badge>;
        },
      },
      {
        id: "overdue",
        accessorKey: "overdueMinor",
        header: t("p03.dun.overdue"),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt.money(row.original.overdueMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "next",
        header: t("p03.dun.next"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.nextStepAt ? fmt.date(row.original.nextStepAt) : t("p01.none"),
      },
    ],
    [t, fmt, accounts],
  );

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-body-sm text-text-secondary">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        {t("p03.dun.note")}
      </p>
      <DataTable
        caption={t("p03.dun.caption")}
        columns={columns}
        data={dunning.data?.items ?? []}
        getRowId={(d) => d.accountId}
        loading={dunning.isPending}
        error={dunning.isError ? <EmptyState tone="error" /> : undefined}
      />
    </div>
  );
}
