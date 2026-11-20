import type { NotificationTemplate } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useSaveTemplate, useTemplates } from "@nexus/services";
import {
  Button,
  DataTable,
  EmptyState,
  Switch,
  useToast,
  type DataTableProps,
} from "@nexus/ui-core";
import { Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { CHANNEL_KEY, EVENT_KEY } from "./notifyShared";
import { TemplateEditor } from "./TemplateEditor";

/** Notification templates grouped by event: channel, language, version, on/off, edit. */
export function TemplatesTab({ online }: { readonly online: boolean }) {
  const t = useText();
  const toast = useToast();
  const templates = useTemplates();
  const save = useSaveTemplate();
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);

  const rows = useMemo(
    () =>
      [...(templates.data?.items ?? [])].sort(
        (a, b) =>
          a.eventType.localeCompare(b.eventType) ||
          a.channel.localeCompare(b.channel) ||
          a.locale.localeCompare(b.locale),
      ),
    [templates.data],
  );

  const columns = useMemo<DataTableProps<NotificationTemplate>["columns"]>(
    () => [
      {
        id: "event",
        header: t("m07.templates.colEvent"),
        enableSorting: false,
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">
              {EVENT_KEY[row.original.eventType]
                ? t(EVENT_KEY[row.original.eventType]!)
                : row.original.eventType}
            </span>
            <span className="font-mono text-number-sm text-text-muted">
              {row.original.eventType}
            </span>
          </span>
        ),
      },
      {
        id: "channel",
        header: t("m07.templates.colChannel"),
        enableSorting: false,
        cell: ({ row }) => t(CHANNEL_KEY[row.original.channel]),
      },
      {
        id: "locale",
        header: t("m07.templates.colLanguage"),
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono">{row.original.locale}</span>,
      },
      {
        id: "version",
        header: t("m07.templates.colVersion"),
        enableSorting: false,
        meta: { numeric: true },
        cell: ({ row }) => row.original.version,
      },
      {
        id: "enabled",
        header: t("m07.templates.colEnabled"),
        enableSorting: false,
        cell: ({ row }) => (
          <Switch
            label={
              <span className="sr-only">
                {t("m07.templates.enabledLabel", { id: row.original.id })}
              </span>
            }
            checked={row.original.enabled}
            disabled={!online || save.isPending}
            onCheckedChange={(enabled) =>
              void save
                .mutateAsync({
                  id: row.original.id,
                  data: { subject: row.original.subject, body: row.original.body, enabled },
                })
                .catch(() =>
                  toast.show({ tone: "danger", title: t("m07.notifications.saveFailed") }),
                )
            }
          />
        ),
      },
      {
        id: "actions",
        header: t("m07.templates.colActions"),
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="secondary"
            aria-label={t("m07.templates.editLabel", { id: row.original.id })}
            onClick={() => setEditing(row.original)}
          >
            {t("common.edit")}
          </Button>
        ),
      },
    ],
    [t, online, save, toast],
  );

  const versions = editing
    ? [
        editing,
        ...rows.filter(
          (r) =>
            r.id !== editing.id &&
            r.eventType === editing.eventType &&
            r.channel === editing.channel,
        ),
      ]
    : [];

  return (
    <>
      <DataTable
        caption={t("m07.templates.caption")}
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        loading={templates.isPending}
        error={
          templates.isError ? (
            <EmptyState
              tone="error"
              title={t("m07.notifications.error")}
              action={
                <Button variant="secondary" onClick={() => void templates.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={<Mail className="h-6 w-6" />} title={t("m07.templates.empty")} />
        }
      />
      {editing && (
        <TemplateEditor versions={versions} onClose={() => setEditing(null)} online={online} />
      )}
    </>
  );
}
