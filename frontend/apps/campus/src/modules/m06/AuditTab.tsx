import type { AuditEvent } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useAuditEvents, type AuditFilters } from "@nexus/services";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  Modal,
  Select,
  type DataTableProps,
} from "@nexus/ui-core";
import { ScrollText, ShieldAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { ChainCheck } from "./ChainCheck";
import { useNames, when } from "./privacyShared";

const PAGE_SIZES = [25, 50, 100];

/** Tamper-evident audit log: filters, server paging, field-name-only detail, page chain check. */
export function AuditTab({ canSeeUsers }: { readonly canSeeUsers: boolean }) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const names = useNames(canSeeUsers);
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState<AuditEvent | null>(null);

  const filters = useMemo<AuditFilters>(
    () => ({
      ...(action.trim() ? { action: action.trim() } : {}),
      ...(actorId ? { actorId } : {}),
      ...(from ? { from: `${from}T00:00:00Z` } : {}),
      ...(to ? { to: `${to}T23:59:59Z` } : {}),
    }),
    [action, actorId, from, to],
  );
  const filtered = Object.keys(filters).length > 0;
  const events = useAuditEvents(filters, page, pageSize);
  const rows = events.data?.items ?? [];

  const actor = useCallback(
    (e: AuditEvent) => {
      if (e.actorKind === "system") return t("m06.audit.system");
      if (e.actorKind === "provider_grant") return t("m06.audit.providerStaff");
      return names.user.get(e.actorId ?? "") ?? e.actorId ?? "";
    },
    [t, names],
  );

  const columns = useMemo<DataTableProps<AuditEvent>["columns"]>(
    () => [
      {
        id: "time",
        header: t("m06.audit.colTime"),
        enableSorting: false,
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="font-mono text-number-sm tabular-nums">
            {when(row.original.occurredAt, locale, timeZone)}
          </span>
        ),
      },
      {
        id: "actor",
        header: t("m06.audit.colActor"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            {actor(row.original)}
            {row.original.grantId && (
              <Badge tone="warning">{t("m06.audit.grant", { grant: row.original.grantId })}</Badge>
            )}
          </span>
        ),
      },
      {
        id: "action",
        header: t("m06.audit.colAction"),
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="rounded-xs font-mono text-body-sm text-brand-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            onClick={() => setOpen(row.original)}
          >
            {row.original.action}
          </button>
        ),
      },
      {
        id: "target",
        header: t("m06.audit.colTarget"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="font-mono text-body-sm text-text-secondary">
            {row.original.targetType}
            {row.original.targetId ? ` · ${row.original.targetId}` : ""}
          </span>
        ),
      },
      {
        id: "device",
        header: t("m06.audit.colDevice"),
        enableSorting: false,
        meta: { hideOnMobile: true },
        cell: ({ row }) => row.original.deviceId ?? "—",
      },
    ],
    [t, locale, timeZone, actor],
  );

  const userOptions = [...names.user.entries()].map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label={t("m06.audit.filterAction")}
          placeholder={t("m06.audit.actionPlaceholder")}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label={t("m06.audit.filterActor")}
          options={[{ value: "", label: t("m06.audit.anyone") }, ...userOptions]}
          value={actorId}
          disabled={!canSeeUsers}
          onChange={(e) => {
            setActorId(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="date"
          label={t("m06.audit.filterFrom")}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <Input
          type="date"
          label={t("m06.audit.filterTo")}
          value={to}
          min={from || undefined}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <ChainCheck events={rows} disabled={filtered} />

      <DataTable
        caption={t("m06.audit.caption")}
        columns={columns}
        data={rows}
        getRowId={(e) => e.id}
        loading={events.isPending}
        pagination={{ page, pageSize, total: events.data?.total ?? 0 }}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        pageSizes={PAGE_SIZES}
        error={
          events.isError ? (
            <EmptyState
              tone="error"
              title={t("m06.privacy.error")}
              action={
                <Button variant="secondary" onClick={() => void events.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title={t("m06.audit.empty")} />
        }
      />

      {open && (
        <Modal
          open
          onOpenChange={(next) => !next && setOpen(null)}
          title={open.action}
          description={when(open.occurredAt, locale, timeZone)}
          footer={
            <Button variant="secondary" onClick={() => setOpen(null)}>
              {t("common.close")}
            </Button>
          }
        >
          <div className="space-y-4">
            {open.grantId && (
              <p className="flex items-center gap-2 rounded-md bg-warning-subtle px-4 py-3 text-body-sm font-medium text-warning-text">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("m06.audit.grantNotice", { grant: open.grantId })}
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
              <dt className="text-text-muted">{t("m06.audit.colActor")}</dt>
              <dd>{actor(open)}</dd>
              <dt className="text-text-muted">{t("m06.audit.colTarget")}</dt>
              <dd className="font-mono">
                {open.targetType}
                {open.targetId ? ` · ${open.targetId}` : ""}
              </dd>
            </dl>
            <section className="space-y-2" aria-labelledby="audit-changes">
              <h3 id="audit-changes" className="text-card-title font-semibold">
                {t("m06.audit.changedFields")}
              </h3>
              <p className="text-body-sm text-text-muted">{t("m06.audit.namesOnly")}</p>
              {open.changes.length === 0 ? (
                <p className="text-body-sm text-text-secondary">{t("m06.audit.noChanges")}</p>
              ) : (
                <ul className="space-y-1">
                  {open.changes.map((c) => (
                    <li key={c.field} className="flex items-center gap-2 font-mono text-body-sm">
                      {c.field}
                      {c.sensitive && <Badge tone="warning">{t("m06.audit.sensitive")}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </Modal>
      )}
    </div>
  );
}
