import {
  ChannelSchema,
  DeliveryStatusSchema,
  type Channel,
  type DeliveryStatus,
  type NotificationDelivery,
} from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useDeliveries, usePeople, type DeliveryFilters } from "@nexus/services";
import { Badge, Button, DataTable, EmptyState, Select, type DataTableProps } from "@nexus/ui-core";
import { Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { CHANNEL_KEY, STATUS_KEY, STATUS_TONE, when } from "./notifyShared";

/** Delivery log: time, recipient, channel, status and reason; filter by status and channel; server paging. */
export function DeliveryLogTab() {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const people = usePeople();
  const [status, setStatus] = useState<DeliveryStatus | "">("");
  const [channel, setChannel] = useState<Channel | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const filters = useMemo<DeliveryFilters>(
    () => ({ ...(status ? { status } : {}), ...(channel ? { channel } : {}) }),
    [status, channel],
  );
  const deliveries = useDeliveries(page, pageSize, filters);
  const name = useMemo(
    () => new Map(people.data?.items.map((p) => [p.id, p.preferredName ?? p.legalName])),
    [people.data],
  );

  const columns = useMemo<DataTableProps<NotificationDelivery>["columns"]>(
    () => [
      {
        id: "time",
        header: t("m07.log.colTime"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-number-sm tabular-nums">
            {when(row.original.queuedAt, locale, timeZone)}
          </span>
        ),
      },
      {
        id: "recipient",
        header: t("m07.log.colRecipient"),
        enableSorting: false,
        meta: { primary: true },
        cell: ({ row }) =>
          name.get(row.original.recipientPersonId) ?? row.original.recipientPersonId,
      },
      {
        id: "channel",
        header: t("m07.log.colChannel"),
        enableSorting: false,
        cell: ({ row }) => t(CHANNEL_KEY[row.original.channel]),
      },
      {
        id: "status",
        header: t("m07.log.colStatus"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={STATUS_TONE[row.original.status]}>
            {t(STATUS_KEY[row.original.status])}
          </Badge>
        ),
      },
      {
        id: "reason",
        header: t("m07.log.colReason"),
        enableSorting: false,
        cell: ({ row }) => row.original.reason ?? "—",
      },
    ],
    [t, locale, timeZone, name],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select
          label={t("m07.log.filterStatus")}
          options={[
            { value: "", label: t("m07.log.anyStatus") },
            ...DeliveryStatusSchema.options.map((s) => ({ value: s, label: t(STATUS_KEY[s]) })),
          ]}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DeliveryStatus | "");
            setPage(1);
          }}
          containerClassName="w-full sm:w-48"
        />
        <Select
          label={t("m07.log.filterChannel")}
          options={[
            { value: "", label: t("m07.log.anyChannel") },
            ...ChannelSchema.options.map((c) => ({ value: c, label: t(CHANNEL_KEY[c]) })),
          ]}
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value as Channel | "");
            setPage(1);
          }}
          containerClassName="w-full sm:w-48"
        />
      </div>
      <DataTable
        caption={t("m07.log.caption")}
        columns={columns}
        data={deliveries.data?.items ?? []}
        getRowId={(d) => d.id}
        loading={deliveries.isPending}
        pagination={{ page, pageSize, total: deliveries.data?.total ?? 0 }}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        error={
          deliveries.isError ? (
            <EmptyState
              tone="error"
              title={t("m07.notifications.error")}
              action={
                <Button variant="secondary" onClick={() => void deliveries.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={<EmptyState icon={<Send className="h-6 w-6" />} title={t("m07.log.empty")} />}
      />
    </div>
  );
}
