import type { Sandbox } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useSandboxes } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { DATA_KEY, KIND_KEY, SANDBOX_STATUS } from "./labels";

/** P17 Sandbox, demo & staging environments (read-only). No sandbox ever holds real institution data. */
export default function SandboxesPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const names = useAccountNames();
  const sandboxes = useSandboxes();

  const columns = useMemo<DataTableProps<Sandbox>["columns"]>(
    () => [
      {
        id: "sandbox",
        header: t("p17.col.sandbox"),
        meta: { primary: true },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{t(KIND_KEY[row.original.kind])}</span>
            <span className="text-body-sm text-text-secondary">
              {row.original.accountId
                ? (names.get(row.original.accountId) ?? row.original.accountId)
                : t("p17.noCustomer")}
            </span>
          </span>
        ),
      },
      {
        id: "type",
        header: t("p17.col.type"),
        enableSorting: false,
        cell: ({ row }) =>
          t("p17.typeRegion", {
            type: t(`m01.type.${row.original.institutionType}`),
            region: t(`m01.region.${row.original.region}`),
          }),
      },
      {
        id: "data",
        header: t("p17.col.data"),
        enableSorting: false,
        cell: ({ row }) => <Badge tone="info">{t(DATA_KEY[row.original.dataKind])}</Badge>,
      },
      {
        id: "version",
        accessorKey: "version",
        header: t("p17.col.version"),
        enableSorting: false,
      },
      {
        id: "status",
        header: t("p17.col.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = SANDBOX_STATUS[row.original.status];
          return <Badge tone={s.tone}>{t(s.key)}</Badge>;
        },
      },
      {
        id: "expires",
        header: t("p17.col.expires"),
        enableSorting: false,
        cell: ({ row }) => fmt.date(row.original.expiresAt),
      },
    ],
    [t, fmt, names],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p17.nav")}
        </h1>
        <p className="flex max-w-prose items-start gap-2 text-body text-text-secondary">
          <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          {t("p17.rule")}
        </p>
      </div>
      <DataTable
        caption={t("p17.caption")}
        columns={columns}
        data={sandboxes.data?.items ?? []}
        getRowId={(s) => s.id}
        loading={sandboxes.isPending}
        error={sandboxes.isError ? <EmptyState tone="error" /> : undefined}
        emptyState={<EmptyState description={t("p17.empty")} />}
      />
    </div>
  );
}
