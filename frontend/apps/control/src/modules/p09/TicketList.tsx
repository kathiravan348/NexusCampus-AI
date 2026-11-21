import type { SupportTicket, TicketStatus } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useStaffDirectory, useTickets } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, Select, type DataTableProps } from "@nexus/ui-core";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { PRIORITY_TONE, TICKET_STATUS, priorityLevel } from "./labels";
import { SlaTable } from "./SlaTable";

const STATUSES = Object.keys(TICKET_STATUS) as TicketStatus[];

/** Tickets with priority, status, SLA and assignee, then the SLA targets (P09). */
export function TicketList() {
  const t = useControlText();
  const fmt = useControlFormat();
  const [status, setStatus] = useState<TicketStatus | "">("");
  const tickets = useTickets(status || null);
  const accounts = useAccountNames();
  const staff = useStaffDirectory();

  const columns = useMemo<DataTableProps<SupportTicket>["columns"]>(
    () => [
      {
        id: "ticket",
        header: t("p09.col.ticket"),
        meta: { primary: true },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <Link
              to={row.original.id}
              className="font-medium text-brand-primary-text underline-offset-2 hover:underline"
            >
              {row.original.subject}
            </Link>
            <span className="font-mono text-body-sm text-text-secondary">
              {row.original.number}
            </span>
          </span>
        ),
      },
      {
        id: "account",
        header: t("p09.col.account"),
        enableSorting: false,
        cell: ({ row }) => accounts.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "priority",
        accessorKey: "priority",
        header: t("p09.col.priority"),
        cell: ({ row }) => (
          <Badge tone={PRIORITY_TONE[row.original.priority]}>
            {t("p09.priority", { level: priorityLevel(row.original.priority) })}
          </Badge>
        ),
      },
      {
        id: "status",
        header: t("p09.col.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = TICKET_STATUS[row.original.status];
          return <Badge tone={s.tone}>{t(s.key)}</Badge>;
        },
      },
      {
        id: "sla",
        accessorKey: "slaDueAt",
        header: t("p09.col.sla"),
        cell: ({ row }) => (
          <span className="flex flex-col gap-1">
            <span>{fmt.date(row.original.slaDueAt)}</span>
            {row.original.breached && <Badge tone="danger">{t("p09.breached")}</Badge>}
          </span>
        ),
      },
      {
        id: "assignee",
        header: t("p09.col.assignee"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.assigneeStaffId
            ? (staff.get(row.original.assigneeStaffId) ?? row.original.assigneeStaffId)
            : t("p09.unassigned"),
      },
    ],
    [t, fmt, accounts, staff],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p09.nav")}
        </h1>
        <Select
          label={t("p09.list.filter")}
          containerClassName="max-w-xs"
          value={status}
          options={[
            { value: "", label: t("p09.list.all") },
            ...STATUSES.map((s) => ({ value: s, label: t(TICKET_STATUS[s].key) })),
          ]}
          onChange={(e) => setStatus(e.target.value as TicketStatus | "")}
        />
        <DataTable
          caption={t("p09.list.caption")}
          columns={columns}
          data={tickets.data?.items ?? []}
          getRowId={(x) => x.id}
          loading={tickets.isPending}
          error={tickets.isError ? <EmptyState tone="error" /> : undefined}
          emptyState={<EmptyState description={t("p09.list.empty")} />}
        />
      </div>
      <SlaTable />
    </div>
  );
}
