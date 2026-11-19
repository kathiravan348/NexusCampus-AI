import type { DeviceSync } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { getOrCreateDeviceId } from "@nexus/offline";
import { usePeople, useRevokeDevice, useServices, useDevices, useUsers } from "@nexus/services";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Modal,
  useToast,
  type DataTableProps,
} from "@nexus/ui-core";
import { MonitorSmartphone, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { DEVICE_STATUS_KEY, DEVICE_TONE, PLATFORM_KEY, when } from "./syncShared";

/** The institution's devices with sync counts; device managers can request a remote wipe. */
export function DevicesTab({ canWipe }: { readonly canWipe: boolean }) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const online = useOnline();
  const { db } = useServices();
  const devices = useDevices();
  const users = useUsers();
  const people = usePeople();
  const revoke = useRevokeDevice();
  const [target, setTarget] = useState<DeviceSync | null>(null);
  const [confirmedOwn, setConfirmedOwn] = useState(false);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);

  useEffect(() => {
    void getOrCreateDeviceId(db).then(setThisDeviceId);
  }, [db]);

  const userName = useMemo(() => {
    const person = new Map(people.data?.items.map((p) => [p.id, p.preferredName ?? p.legalName]));
    return new Map(users.data?.items.map((u) => [u.id, person.get(u.personId) ?? u.email]));
  }, [users.data, people.data]);

  const columns = useMemo<DataTableProps<DeviceSync>["columns"]>(
    () => [
      {
        accessorKey: "label",
        header: t("m10.devices.colDevice"),
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.label}</span>
            <span className="text-body-sm text-text-secondary">
              {userName.get(row.original.userId) ?? row.original.userId} ·{" "}
              {t(PLATFORM_KEY[row.original.platform])}
            </span>
          </span>
        ),
      },
      {
        id: "lastSync",
        accessorFn: (d) => d.lastSyncAt ?? "",
        header: t("m10.devices.colLastSync"),
        cell: ({ row }) =>
          row.original.lastSyncAt ? (
            <span className="font-mono text-number-sm tabular-nums">
              {when(row.original.lastSyncAt, locale, timeZone)}
            </span>
          ) : (
            t("m10.devices.never")
          ),
      },
      {
        id: "counts",
        header: t("m10.devices.colCounts"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-2">
            <Badge tone="info">
              {t("m10.devices.pending", { count: row.original.pendingCount })}
            </Badge>
            {row.original.conflictCount > 0 && (
              <Badge tone="warning">
                {t("m10.devices.conflicts", { count: row.original.conflictCount })}
              </Badge>
            )}
            {row.original.lostWriteCount > 0 && (
              <Badge tone="danger">
                {t("m10.devices.lost", { count: row.original.lostWriteCount })}
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: "status",
        accessorFn: (d) => d.status,
        header: t("m10.devices.colStatus"),
        cell: ({ row }) => (
          <Badge tone={DEVICE_TONE[row.original.status]}>
            {t(DEVICE_STATUS_KEY[row.original.status])}
          </Badge>
        ),
      },
      ...(canWipe
        ? [
            {
              id: "actions",
              header: t("m10.devices.colActions"),
              enableSorting: false,
              cell: ({ row }) =>
                row.original.status === "active" ? (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!online}
                    aria-label={t("m10.devices.revokeLabel", { device: row.original.label })}
                    onClick={() => {
                      setTarget(row.original);
                      setConfirmedOwn(false);
                    }}
                  >
                    {t("m10.devices.revoke")}
                  </Button>
                ) : null,
            } satisfies DataTableProps<DeviceSync>["columns"][number],
          ]
        : []),
    ],
    [t, userName, locale, timeZone, canWipe, online],
  );

  const isThisDevice = target !== null && target.id === thisDeviceId;
  const needsSecondConfirm = isThisDevice && !confirmedOwn;

  const onConfirm = async () => {
    if (!target) return;
    if (needsSecondConfirm) {
      setConfirmedOwn(true);
      return;
    }
    try {
      await revoke.mutateAsync(target.id);
      toast.show({ tone: "success", title: t("m10.devices.revoked", { device: target.label }) });
      setTarget(null);
    } catch {
      toast.show({ tone: "danger", title: t("m10.sync.failed") });
    }
  };

  return (
    <>
      <DataTable
        caption={t("m10.devices.caption")}
        columns={columns}
        data={devices.data?.items ?? []}
        getRowId={(d) => d.id}
        loading={devices.isPending}
        error={
          devices.isError ? (
            <EmptyState
              tone="error"
              title={t("m10.sync.error")}
              action={
                <Button variant="secondary" onClick={() => void devices.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={<MonitorSmartphone className="h-6 w-6" />}
            title={t("m10.devices.empty")}
          />
        }
      />
      {target && (
        <Modal
          open
          onOpenChange={(next) => !next && setTarget(null)}
          title={t("m10.devices.confirmTitle", { device: target.label })}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" loading={revoke.isPending} onClick={() => void onConfirm()}>
                {t(needsSecondConfirm ? "m10.devices.confirmOwnFirst" : "m10.devices.confirm")}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-body text-text-secondary">
            <p className="flex items-start gap-2 rounded-md bg-danger-subtle px-4 py-3 font-medium text-danger-text">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("m10.devices.lossWarning", { count: target.pendingCount })}
            </p>
            {isThisDevice && (
              <p className="font-medium text-warning-text">{t("m10.devices.ownWarning")}</p>
            )}
            <p>{t("m10.devices.wipeNote")}</p>
          </div>
        </Modal>
      )}
    </>
  );
}
