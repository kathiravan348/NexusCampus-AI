import type { StaffUser } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useStaff } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { ROLE_KEY } from "../../app/roles";

/** P13 Provider staff & security (read-only): roles, MFA, last sign-in. */
export default function StaffPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const staff = useStaff();

  const columns = useMemo<DataTableProps<StaffUser>["columns"]>(
    () => [
      {
        id: "name",
        accessorKey: "displayName",
        header: t("p13.col.name"),
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.displayName}</span>
            <span className="text-body-sm text-text-secondary">{row.original.workEmail}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {row.original.partnerId && <Badge tone="info">{t("p13.partnerUser")}</Badge>}
              {!row.original.active && <Badge tone="neutral">{t("p13.inactive")}</Badge>}
            </span>
          </span>
        ),
      },
      {
        id: "roles",
        header: t("p13.col.roles"),
        enableSorting: false,
        cell: ({ row }) => row.original.roles.map((r) => t(ROLE_KEY[r])).join(", "),
      },
      {
        id: "mfa",
        header: t("p13.col.mfa"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.mfaEnrolled ? (
            <Badge tone="success">{t("p13.mfaOn")}</Badge>
          ) : (
            <Badge tone="danger">{t("p13.mfaOff")}</Badge>
          ),
      },
      {
        id: "lastSignIn",
        header: t("p13.col.lastSignIn"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.lastSignInAt ? fmt.date(row.original.lastSignInAt) : t("p13.never"),
      },
    ],
    [t, fmt],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p13.nav")}
        </h1>
        <p className="flex max-w-prose items-start gap-2 text-body text-text-secondary">
          <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          {t("p13.statement")}
        </p>
      </div>
      <DataTable
        caption={t("p13.caption")}
        columns={columns}
        data={staff.data?.items ?? []}
        getRowId={(s) => s.id}
        loading={staff.isPending}
        error={staff.isError ? <EmptyState tone="error" /> : undefined}
      />
    </div>
  );
}
