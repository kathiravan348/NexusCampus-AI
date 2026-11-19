import type { DataSubjectRequest, DsrStatus } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { ApiRequestError, useDataRequests, useUpdateDataRequest } from "@nexus/services";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Modal,
  Textarea,
  useToast,
  type DataTableProps,
} from "@nexus/ui-core";
import { Inbox } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { day, DSR_KIND_KEY, DSR_STATUS_KEY, DSR_TONE, useNames } from "./privacyShared";

export interface DataRequestsTabProps {
  readonly canSeeUsers: boolean;
  /** Injected in tests; defaults to the current time. */
  readonly now?: Date;
}

const isOpen = (r: DataSubjectRequest) => r.status === "received" || r.status === "in_progress";

/** Data subject requests with due dates, overdue badge and status steps (received → in progress → done). */
export function DataRequestsTab({ canSeeUsers, now }: DataRequestsTabProps) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const requests = useDataRequests();
  const update = useUpdateDataRequest();
  const names = useNames(canSeeUsers);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const nowMs = (now ?? new Date()).getTime();
  const overdue = useCallback(
    (r: DataSubjectRequest) => isOpen(r) && Date.parse(r.dueAt) < nowMs,
    [nowMs],
  );

  const columns = useMemo<DataTableProps<DataSubjectRequest>["columns"]>(
    () => [
      {
        id: "person",
        accessorFn: (r) => names.person.get(r.personId) ?? r.personId,
        header: t("m06.requests.colPerson"),
        meta: { primary: true },
        cell: ({ row }) => (
          <button
            type="button"
            className="rounded-xs font-medium text-brand-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            onClick={() => {
              setOpenId(row.original.id);
              setRejecting(false);
              setReason("");
            }}
          >
            {names.person.get(row.original.personId) ?? row.original.personId}
          </button>
        ),
      },
      {
        id: "kind",
        accessorFn: (r) => r.kind,
        header: t("m06.requests.colKind"),
        cell: ({ row }) => t(DSR_KIND_KEY[row.original.kind]),
      },
      {
        id: "status",
        accessorFn: (r) => r.status,
        header: t("m06.requests.colStatus"),
        cell: ({ row }) => (
          <Badge tone={DSR_TONE[row.original.status]}>
            {t(DSR_STATUS_KEY[row.original.status])}
          </Badge>
        ),
      },
      {
        id: "due",
        accessorFn: (r) => r.dueAt,
        header: t("m06.requests.colDue"),
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-number-sm tabular-nums">
              {day(row.original.dueAt, locale, timeZone)}
            </span>
            {overdue(row.original) && <Badge tone="danger">{t("m06.requests.overdue")}</Badge>}
          </span>
        ),
      },
    ],
    [t, names, locale, timeZone, overdue],
  );

  const current = requests.data?.items.find((r) => r.id === openId) ?? null;

  const move = async (status: DsrStatus) => {
    if (!current) return;
    try {
      await update.mutateAsync({
        id: current.id,
        data: status === "rejected" ? { status, reason: reason.trim() } : { status },
      });
      toast.show({ tone: "success", title: t("m06.requests.updated") });
      setRejecting(false);
    } catch (error) {
      const conflict = error instanceof ApiRequestError && error.error.code === "conflict";
      toast.show({
        tone: "danger",
        title: t(conflict ? "m06.requests.notAllowed" : "m06.privacy.saveFailed"),
      });
    }
  };

  return (
    <>
      <DataTable
        caption={t("m06.requests.caption")}
        columns={columns}
        data={requests.data?.items ?? []}
        getRowId={(r) => r.id}
        loading={requests.isPending}
        error={
          requests.isError ? (
            <EmptyState
              tone="error"
              title={t("m06.privacy.error")}
              action={
                <Button variant="secondary" onClick={() => void requests.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={<Inbox className="h-6 w-6" />} title={t("m06.requests.empty")} />
        }
      />
      {current && (
        <Modal
          open
          onOpenChange={(next) => !next && setOpenId(null)}
          title={t(DSR_KIND_KEY[current.kind])}
          description={names.person.get(current.personId) ?? current.personId}
          footer={
            <Button variant="secondary" onClick={() => setOpenId(null)}>
              {t("common.close")}
            </Button>
          }
        >
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
              <dt className="text-text-muted">{t("m06.requests.colStatus")}</dt>
              <dd>
                <Badge tone={DSR_TONE[current.status]}>{t(DSR_STATUS_KEY[current.status])}</Badge>
              </dd>
              <dt className="text-text-muted">{t("m06.requests.received")}</dt>
              <dd className="font-mono tabular-nums">
                {day(current.receivedAt, locale, timeZone)}
              </dd>
              <dt className="text-text-muted">{t("m06.requests.colDue")}</dt>
              <dd className="flex items-center gap-2 font-mono tabular-nums">
                {day(current.dueAt, locale, timeZone)}
                {overdue(current) && <Badge tone="danger">{t("m06.requests.overdue")}</Badge>}
              </dd>
            </dl>
            {current.status === "received" && (
              <Button loading={update.isPending} onClick={() => void move("in_progress")}>
                {t("m06.requests.start")}
              </Button>
            )}
            {current.status === "in_progress" && !rejecting && (
              <div className="flex flex-wrap gap-3">
                <Button loading={update.isPending} onClick={() => void move("completed")}>
                  {t("m06.requests.complete")}
                </Button>
                <Button variant="danger" onClick={() => setRejecting(true)}>
                  {t("m06.requests.reject")}
                </Button>
              </div>
            )}
            {rejecting && (
              <div className="space-y-3">
                <Textarea
                  label={t("m06.requests.reason")}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button
                  variant="danger"
                  disabled={!reason.trim()}
                  loading={update.isPending}
                  onClick={() => void move("rejected")}
                >
                  {t("m06.requests.confirmReject")}
                </Button>
              </div>
            )}
            {!isOpen(current) && (
              <p className="text-body-sm text-text-muted">{t("m06.requests.closed")}</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
