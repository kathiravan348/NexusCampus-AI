import type { Role } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { usePermissions, useRoles } from "@nexus/services";
import { Badge, Button, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { Plus, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { RoleEditorModal } from "./RoleEditorModal";

/** Roles list: system roles read-only, custom roles editable in a permission matrix (M02). */
export function RolesTab({ online }: { readonly online: boolean }) {
  const t = useText();
  const roles = useRoles();
  const permissions = usePermissions();
  const [editing, setEditing] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);

  const openEditor = (role: Role | null) => {
    setEditing(role);
    setOpen(true);
  };

  const columns = useMemo<DataTableProps<Role>["columns"]>(
    () => [
      {
        accessorKey: "name",
        header: t("common.name"),
        meta: { primary: true },
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        id: "kind",
        accessorFn: (r) => (r.system ? 0 : 1),
        header: t("m02.roles.colKind"),
        cell: ({ row }) =>
          row.original.system ? (
            <Badge tone="neutral">{t("m02.roles.system")}</Badge>
          ) : (
            <Badge tone="brand">{t("m02.roles.custom")}</Badge>
          ),
      },
      {
        id: "count",
        accessorFn: (r) => r.permissions.length,
        header: t("m02.roles.colPermissions"),
        meta: { numeric: true },
        cell: ({ row }) =>
          t("m02.roles.permissionCount", { count: row.original.permissions.length }),
      },
      {
        id: "actions",
        header: t("m02.roles.colActions"),
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="secondary"
            size="sm"
            aria-label={t(row.original.system ? "m02.roles.viewRole" : "m02.roles.editRole", {
              name: row.original.name,
            })}
            onClick={() => openEditor(row.original)}
          >
            {t(row.original.system ? "m02.roles.view" : "common.edit")}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-text-secondary">{t("m02.roles.intro")}</p>
        <Button onClick={() => openEditor(null)} disabled={!online || !permissions.data}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("m02.roles.newRole")}
        </Button>
      </div>
      <DataTable
        caption={t("m02.roles.caption")}
        columns={columns}
        data={roles.data?.items ?? []}
        getRowId={(r) => r.id}
        loading={roles.isPending}
        error={
          roles.isError ? (
            <EmptyState
              tone="error"
              title={t("m02.access.error")}
              action={
                <Button variant="secondary" onClick={() => void roles.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={t("m02.roles.empty")} />
        }
      />
      <RoleEditorModal
        role={editing}
        open={open}
        onOpenChange={setOpen}
        permissions={permissions.data?.items ?? []}
        online={online}
      />
    </div>
  );
}
