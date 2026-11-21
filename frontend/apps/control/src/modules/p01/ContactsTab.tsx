import type { AccountContact } from "@nexus/contracts";
import { formatPhone } from "@nexus/i18n";
import { useControlText } from "@nexus/i18n/control";
import { useAccountContacts } from "@nexus/services/control";
import { DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { CONTACT_KEY } from "./labels";

/** The customer's commercial contacts (billing, technical, executive, data protection). */
export function ContactsTab({ accountId }: { readonly accountId: string }) {
  const t = useControlText();
  const contacts = useAccountContacts(accountId);
  const columns = useMemo<DataTableProps<AccountContact>["columns"]>(
    () => [
      { id: "name", accessorKey: "name", header: t("p01.col.name"), meta: { primary: true } },
      {
        id: "kind",
        header: t("p01.contacts.kind"),
        cell: ({ row }) => t(CONTACT_KEY[row.original.kind]),
      },
      {
        id: "email",
        header: t("p01.contacts.email"),
        enableSorting: false,
        cell: ({ row }) => (
          <a
            className="text-brand-primary-text hover:underline"
            href={`mailto:${row.original.workEmail}`}
          >
            {row.original.workEmail}
          </a>
        ),
      },
      {
        id: "phone",
        header: t("p01.contacts.phone"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.phone ? (
            <span dir="ltr" className="tabular-nums">
              {formatPhone(row.original.phone)}
            </span>
          ) : (
            t("p01.none")
          ),
      },
    ],
    [t],
  );
  return (
    <DataTable
      caption={t("p01.contacts.caption")}
      columns={columns}
      data={contacts.data?.items ?? []}
      getRowId={(c) => c.id}
      loading={contacts.isPending}
      error={contacts.isError ? <EmptyState tone="error" /> : undefined}
    />
  );
}
