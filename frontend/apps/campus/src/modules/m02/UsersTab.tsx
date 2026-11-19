import type { Person, User, UserStatus } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { usePeople, useRoleAssignments, useRoles, useUsers } from "@nexus/services";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Select,
  type DataTableProps,
} from "@nexus/ui-core";
import { Search, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { formatWhen, STATUS_KEY, STATUS_TONE } from "./accessShared";
import { InviteUserModal } from "./InviteUserModal";
import { UserDetail } from "./UserDetail";

export interface UserRow {
  readonly user: User;
  readonly person: Person | undefined;
  readonly name: string;
  readonly roleNames: string[];
}

export interface UsersTabProps {
  readonly canInvite: boolean;
  readonly canManageRoles: boolean;
  readonly online: boolean;
  readonly selfUserId: string;
}

const STATUSES: UserStatus[] = ["invited", "active", "suspended", "locked"];

/** Users list: search, status filter, minors' contact masked per role (G-6), invite and detail. */
export function UsersTab({ canInvite, canManageRoles, online, selfUserId }: UsersTabProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const users = useUsers();
  const people = usePeople();
  const roles = useRoles(canManageRoles);
  const assignments = useRoleAssignments(canManageRoles);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const rows = useMemo<UserRow[]>(() => {
    const byPerson = new Map(people.data?.items.map((p) => [p.id, p]));
    const roleName = new Map(roles.data?.items.map((r) => [r.id, r.name]));
    return (users.data?.items ?? []).map((user) => {
      const person = byPerson.get(user.personId);
      const roleNames = (assignments.data?.items ?? [])
        .filter((a) => a.userId === user.id)
        .map((a) => roleName.get(a.roleId) ?? a.roleId);
      return {
        user,
        person,
        name: person?.preferredName ?? person?.legalName ?? user.email,
        roleNames: [...new Set(roleNames)],
      };
    });
  }, [users.data, people.data, roles.data, assignments.data]);

  const visible = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    const matches =
      !q || row.name.toLowerCase().includes(q) || row.user.email.toLowerCase().includes(q);
    return matches && (status === "" || row.user.status === status);
  });

  const columns = useMemo<DataTableProps<UserRow>["columns"]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: t("m02.users.colName"),
        meta: { primary: true },
        cell: ({ row }) =>
          canManageRoles ? (
            <button
              type="button"
              className="font-medium text-brand-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-xs"
              onClick={() => setOpenUserId(row.original.user.id)}
            >
              {row.original.name}
            </button>
          ) : (
            <span className="font-medium">{row.original.name}</span>
          ),
      },
      {
        id: "contact",
        header: t("m02.users.colContact"),
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original.person;
          if (p?.isMinor && p.email === null) {
            return <Badge tone="warning">{t("common.restricted")}</Badge>;
          }
          return <span className="text-text-secondary">{p?.email ?? row.original.user.email}</span>;
        },
      },
      ...(canManageRoles
        ? [
            {
              id: "roles",
              header: t("m02.users.colRoles"),
              enableSorting: false,
              cell: ({ row }) => row.original.roleNames.join(", ") || "—",
            } satisfies DataTableProps<UserRow>["columns"][number],
          ]
        : []),
      {
        id: "status",
        accessorFn: (row) => row.user.status,
        header: t("m02.users.colStatus"),
        cell: ({ row }) => (
          <Badge tone={STATUS_TONE[row.original.user.status]}>
            {t(STATUS_KEY[row.original.user.status])}
          </Badge>
        ),
      },
      {
        id: "lastSignIn",
        accessorFn: (row) => row.user.lastSignInAt ?? "",
        header: t("m02.users.colLastSignIn"),
        cell: ({ row }) =>
          row.original.user.lastSignInAt ? (
            <span className="font-mono text-number-sm tabular-nums">
              {formatWhen(row.original.user.lastSignInAt, locale, timeZone)}
            </span>
          ) : (
            t("m02.users.never")
          ),
      },
    ],
    [t, canManageRoles, locale, timeZone],
  );

  const failed = users.isError || people.isError;
  const openRow = rows.find((r) => r.user.id === openUserId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          type="search"
          label={t("common.search")}
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          containerClassName="w-full sm:w-72"
        />
        <Select
          label={t("m02.users.statusFilter")}
          options={[
            { value: "", label: t("m02.users.statusAll") },
            ...STATUSES.map((s) => ({ value: s, label: t(STATUS_KEY[s]) })),
          ]}
          value={status}
          onChange={(e) => setStatus(e.target.value as UserStatus | "")}
          containerClassName="w-full sm:w-48"
        />
        {canInvite && (
          <Button className="sm:ms-auto" onClick={() => setInviteOpen(true)} disabled={!online}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t("m02.users.invite")}
          </Button>
        )}
      </div>

      <DataTable
        caption={t("m02.users.caption")}
        columns={columns}
        data={visible}
        getRowId={(row) => row.user.id}
        loading={users.isPending || people.isPending}
        error={
          failed ? (
            <EmptyState
              tone="error"
              title={t("m02.access.error")}
              action={
                <Button variant="secondary" onClick={() => void users.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={<Users className="h-6 w-6" />} title={t("m02.users.empty")} />
        }
      />

      {canInvite && (
        <InviteUserModal open={inviteOpen} onOpenChange={setInviteOpen} online={online} />
      )}
      {openRow && (
        <UserDetail
          row={openRow}
          online={online}
          isSelf={openRow.user.id === selfUserId}
          onClose={() => setOpenUserId(null)}
        />
      )}
    </div>
  );
}
