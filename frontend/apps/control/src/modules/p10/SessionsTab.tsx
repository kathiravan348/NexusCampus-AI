import type { BrokerSession } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useBrokerSessions, useStaffDirectory } from "@nexus/services/control";
import { DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";

/** Approved, time-boxed, recorded support sessions (V-3). */
export function SessionsTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const sessions = useBrokerSessions();
  const staff = useStaffDirectory();

  const columns = useMemo<DataTableProps<BrokerSession>["columns"]>(
    () => [
      {
        id: "staff",
        header: t("p10.sess.staff"),
        meta: { primary: true },
        enableSorting: false,
        cell: ({ row }) => staff.get(row.original.staffId) ?? row.original.staffId,
      },
      {
        id: "window",
        header: t("p10.sess.window"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span>
              {t("p10.sess.range", {
                start: fmt.date(row.original.startsAt),
                end: fmt.date(row.original.endsAt),
              })}
            </span>
            {row.original.endedEarlyAt && (
              <span className="text-body-sm text-text-secondary">
                {t("p10.sess.endedEarly", { date: fmt.date(row.original.endedEarlyAt) })}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "actions",
        accessorKey: "actionsCount",
        header: t("p10.sess.actions"),
        cell: ({ row }) => (
          <span className="tabular-nums">{fmt.number(row.original.actionsCount)}</span>
        ),
      },
    ],
    [t, fmt, staff],
  );

  return (
    <DataTable
      caption={t("p10.sess.caption")}
      columns={columns}
      data={sessions.data?.items ?? []}
      getRowId={(s) => s.id}
      loading={sessions.isPending}
      error={sessions.isError ? <EmptyState tone="error" /> : undefined}
    />
  );
}
