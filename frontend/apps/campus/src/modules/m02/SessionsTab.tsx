import type { AuthMethod, Session } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { usePeople, useRevokeSession, useSessions, useUsers } from "@nexus/services";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  useToast,
  type DataTableProps,
} from "@nexus/ui-core";
import { MonitorSmartphone } from "lucide-react";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { formatWhen } from "./accessShared";

const METHOD_KEY: Readonly<Record<AuthMethod, MessageKey>> = {
  password: "m02.sessions.method.password",
  sso: "m02.sessions.method.sso",
  passkey: "m02.sessions.method.passkey",
};

export interface SessionsTabProps {
  readonly online: boolean;
  /** Show whose session it is (only people who manage users see others' sessions). */
  readonly showUser: boolean;
  readonly selfUserId: string;
}

/** Active device sessions with revoke (own sessions for everyone; all with `m02.user.invite`). */
export function SessionsTab({ online, showUser, selfUserId }: SessionsTabProps) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const sessions = useSessions();
  const users = useUsers(showUser);
  const people = usePeople();
  const revoke = useRevokeSession();

  const nameOf = useMemo(() => {
    const person = new Map(people.data?.items.map((p) => [p.id, p]));
    const map = new Map<string, string>();
    for (const u of users.data?.items ?? []) {
      const p = person.get(u.personId);
      map.set(u.id, p?.preferredName ?? p?.legalName ?? u.email);
    }
    return map;
  }, [users.data, people.data]);

  const active = (sessions.data?.items ?? []).filter((s) => s.revokedAt === null);

  const columns = useMemo<DataTableProps<Session>["columns"]>(
    () => [
      ...(showUser
        ? [
            {
              id: "user",
              accessorFn: (s: Session) => nameOf.get(s.userId) ?? s.userId,
              header: t("m02.sessions.colUser"),
              meta: { primary: true },
            } satisfies DataTableProps<Session>["columns"][number],
          ]
        : []),
      {
        accessorKey: "deviceLabel",
        header: t("m02.sessions.colDevice"),
        ...(showUser ? {} : { meta: { primary: true } }),
      },
      {
        id: "method",
        accessorFn: (s) => s.authMethod,
        header: t("m02.sessions.colMethod"),
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            {t(METHOD_KEY[row.original.authMethod])}
            {row.original.mfaVerified && <Badge tone="success">{t("m02.sessions.mfa")}</Badge>}
          </span>
        ),
      },
      {
        id: "lastSeen",
        accessorFn: (s) => s.lastSeenAt,
        header: t("m02.sessions.colLastSeen"),
        cell: ({ row }) => (
          <span className="font-mono text-number-sm tabular-nums">
            {formatWhen(row.original.lastSeenAt, locale, timeZone)}
          </span>
        ),
      },
      {
        id: "actions",
        header: t("m02.sessions.colActions"),
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="secondary"
            size="sm"
            disabled={!online}
            aria-label={t("m02.sessions.revokeLabel", { device: row.original.deviceLabel })}
            onClick={() =>
              void revoke
                .mutateAsync(row.original.id)
                .then(() => toast.show({ tone: "success", title: t("m02.sessions.revoked") }))
                .catch(() => toast.show({ tone: "danger", title: t("m02.access.saveFailed") }))
            }
          >
            {t(
              row.original.userId === selfUserId
                ? "m02.sessions.signOutDevice"
                : "m02.sessions.revoke",
            )}
          </Button>
        ),
      },
    ],
    [t, showUser, nameOf, locale, timeZone, online, revoke, toast, selfUserId],
  );

  return (
    <DataTable
      caption={t("m02.sessions.caption")}
      columns={columns}
      data={active}
      getRowId={(s) => s.id}
      loading={sessions.isPending}
      error={
        sessions.isError ? (
          <EmptyState
            tone="error"
            title={t("m02.access.error")}
            action={
              <Button variant="secondary" onClick={() => void sessions.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : undefined
      }
      emptyState={
        <EmptyState
          icon={<MonitorSmartphone className="h-6 w-6" />}
          title={t("m02.sessions.empty")}
        />
      }
    />
  );
}
