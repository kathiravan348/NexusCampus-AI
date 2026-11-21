import type { BrokerRequest } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useBrokerRequests, useStaffCan, useStaffDirectory } from "@nexus/services/control";
import { Badge, Button, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { MODULE_NAME_KEY, REQUEST_STATUS } from "./labels";
import { RequestAccessModal } from "./RequestAccessModal";

/** Our access requests; the status is the institution's decision (V-3). */
export function RequestsTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const can = useStaffCan();
  const requests = useBrokerRequests();
  const accounts = useAccountNames();
  const staff = useStaffDirectory();
  const [asking, setAsking] = useState(false);

  const columns = useMemo<DataTableProps<BrokerRequest>["columns"]>(
    () => [
      {
        id: "account",
        header: t("p10.col.account"),
        meta: { primary: true },
        enableSorting: false,
        cell: ({ row }) => accounts.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "scope",
        header: t("p10.col.scope"),
        enableSorting: false,
        cell: ({ row }) =>
          t("p10.scope", {
            modules: row.original.modules
              .map((m) => t(MODULE_NAME_KEY[m] ?? "p01.none"))
              .join(", "),
            mode: t(row.original.mode === "read" ? "p10.mode.read" : "p10.mode.edit"),
          }),
      },
      {
        id: "duration",
        header: t("p10.col.duration"),
        enableSorting: false,
        cell: ({ row }) => t("p10.hours", { hours: row.original.durationHours }),
      },
      {
        id: "status",
        header: t("p10.col.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = REQUEST_STATUS[row.original.status];
          return <Badge tone={s.tone}>{t(s.key)}</Badge>;
        },
      },
      {
        id: "requested",
        accessorKey: "requestedAt",
        header: t("p10.col.requested"),
        cell: ({ row }) =>
          t("p10.requestedBy", {
            name: staff.get(row.original.requestedByStaffId) ?? row.original.requestedByStaffId,
            date: fmt.date(row.original.requestedAt),
          }),
      },
      {
        id: "reason",
        header: t("p10.col.reason"),
        enableSorting: false,
        cell: ({ row }) => <span className="text-body-sm">{row.original.reason}</span>,
      },
    ],
    [t, fmt, accounts, staff],
  );

  return (
    <div className="space-y-4">
      {can("ctl.broker.request") && (
        <Button onClick={() => setAsking(true)}>
          <Plus className="me-1 h-4 w-4" aria-hidden="true" />
          {t("p10.new")}
        </Button>
      )}
      <DataTable
        caption={t("p10.req.caption")}
        columns={columns}
        data={requests.data?.items ?? []}
        getRowId={(r) => r.id}
        loading={requests.isPending}
        error={requests.isError ? <EmptyState tone="error" /> : undefined}
      />
      {asking && <RequestAccessModal onClose={() => setAsking(false)} />}
    </div>
  );
}
