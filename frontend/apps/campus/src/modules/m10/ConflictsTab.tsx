import type { ConflictResolution, SyncConflict } from "@nexus/contracts";
import { isKnownMessageKey, useText } from "@nexus/i18n";
import { useDevices, useResolveConflict, useSyncConflicts } from "@nexus/services";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Select,
  useToast,
  type DataTableProps,
} from "@nexus/ui-core";
import { GitMerge } from "lucide-react";
import { useMemo, useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { RESOLUTION_KEY, when } from "./syncShared";

const RESOLUTIONS: ConflictResolution[] = ["keep_server", "keep_client", "merged"];

/** Server-side sync conflicts (no payloads): filter open / resolved and resolve one. */
export function ConflictsTab({ canResolve }: { readonly canResolve: boolean }) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const online = useOnline();
  const conflicts = useSyncConflicts();
  const devices = useDevices();
  const resolve = useResolveConflict();
  const [status, setStatus] = useState<"open" | "resolved">("open");

  const deviceLabel = useMemo(
    () => new Map(devices.data?.items.map((d) => [d.id, d.label])),
    [devices.data],
  );
  const rows = (conflicts.data?.items ?? []).filter((c) => c.status === status);

  const columns = useMemo<DataTableProps<SyncConflict>["columns"]>(
    () => [
      {
        id: "summary",
        header: t("m10.conflicts.colSummary"),
        enableSorting: false,
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">
              {isKnownMessageKey(row.original.summaryKey)
                ? t(row.original.summaryKey)
                : row.original.operation}
            </span>
            <span className="font-mono text-number-sm text-text-muted">
              {row.original.moduleId} · {row.original.operation}
            </span>
          </span>
        ),
      },
      {
        id: "device",
        header: t("m10.conflicts.colDevice"),
        enableSorting: false,
        cell: ({ row }) => deviceLabel.get(row.original.deviceId) ?? row.original.deviceId,
      },
      {
        id: "created",
        accessorFn: (c) => c.createdAt,
        header: t("m10.conflicts.colCreated"),
        cell: ({ row }) => (
          <span className="font-mono text-number-sm tabular-nums">
            {when(row.original.createdAt, locale, timeZone)}
          </span>
        ),
      },
      {
        id: "resolution",
        header: t("m10.conflicts.colResolution"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.resolution ? (
            <Badge tone="success">{t(RESOLUTION_KEY[row.original.resolution])}</Badge>
          ) : canResolve ? (
            <span className="flex flex-wrap gap-2">
              {RESOLUTIONS.map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant="secondary"
                  disabled={!online || resolve.isPending}
                  onClick={() =>
                    void resolve
                      .mutateAsync({ id: row.original.id, resolution: r })
                      .then(() =>
                        toast.show({ tone: "success", title: t("m10.conflicts.resolved") }),
                      )
                      .catch(() => toast.show({ tone: "danger", title: t("m10.sync.failed") }))
                  }
                >
                  {t(RESOLUTION_KEY[r])}
                </Button>
              ))}
            </span>
          ) : (
            <Badge tone="warning">{t("m10.conflicts.open")}</Badge>
          ),
      },
    ],
    [t, deviceLabel, locale, timeZone, canResolve, online, resolve, toast],
  );

  return (
    <div className="space-y-4">
      <Select
        label={t("m10.conflicts.filter")}
        options={[
          { value: "open", label: t("m10.conflicts.open") },
          { value: "resolved", label: t("m10.conflicts.resolvedFilter") },
        ]}
        value={status}
        onChange={(e) => setStatus(e.target.value as "open" | "resolved")}
        containerClassName="w-full sm:w-48"
      />
      <DataTable
        caption={t("m10.conflicts.caption")}
        columns={columns}
        data={rows}
        getRowId={(c) => c.id}
        loading={conflicts.isPending}
        error={
          conflicts.isError ? (
            <EmptyState
              tone="error"
              title={t("m10.sync.error")}
              action={
                <Button variant="secondary" onClick={() => void conflicts.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={<GitMerge className="h-6 w-6" />} title={t("m10.conflicts.empty")} />
        }
      />
    </div>
  );
}
