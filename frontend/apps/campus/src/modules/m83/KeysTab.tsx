import type { KeyStatus } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useKeyStatus } from "@nexus/services";
import { Badge, Button, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { KeyRound } from "lucide-react";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { CUSTODY_KEY, KEY_STATE_KEY, PURPOSE_KEY, when } from "./vaultShared";

/** Vault keys: purpose, custody and status only — never key material. No actions in the prototype. */
export function KeysTab() {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const keys = useKeyStatus();

  const columns = useMemo<DataTableProps<KeyStatus>["columns"]>(
    () => [
      {
        id: "purpose",
        header: t("m83.keys.colPurpose"),
        enableSorting: false,
        meta: { primary: true },
        cell: ({ row }) => t(PURPOSE_KEY[row.original.purpose]),
      },
      {
        id: "custody",
        header: t("m83.keys.colCustody"),
        enableSorting: false,
        cell: ({ row }) => t(CUSTODY_KEY[row.original.custody]),
      },
      {
        id: "status",
        header: t("m83.keys.colStatus"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={row.original.status === "active" ? "success" : "warning"}>
            {t(KEY_STATE_KEY[row.original.status])}
          </Badge>
        ),
      },
      {
        id: "dates",
        header: t("m83.keys.colDates"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-number-sm tabular-nums">
            {when(row.original.createdAt, locale, timeZone)}
            {row.original.rotatedAt &&
              ` · ${t("m83.keys.rotated", { date: when(row.original.rotatedAt, locale, timeZone) })}`}
          </span>
        ),
      },
    ],
    [t, locale, timeZone],
  );

  return (
    <div className="space-y-4">
      <p className="text-body-sm text-text-secondary">{t("m83.keys.intro")}</p>
      <DataTable
        caption={t("m83.keys.caption")}
        columns={columns}
        data={keys.data?.items ?? []}
        getRowId={(k) => k.id}
        loading={keys.isPending}
        error={
          keys.isError ? (
            <EmptyState
              tone="error"
              title={t("m83.vault.error")}
              action={
                <Button variant="secondary" onClick={() => void keys.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={<KeyRound className="h-6 w-6" />} title={t("m83.keys.empty")} />
        }
      />
    </div>
  );
}
