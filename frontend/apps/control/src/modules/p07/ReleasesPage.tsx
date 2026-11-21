import type { Release } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useReleases, useRollouts, useStaffCan } from "@nexus/services/control";
import { Badge, Button, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useControlFormat } from "../../app/format";
import { CHANNEL_KEY } from "../p06/labels";
import { RELEASE_STATUS } from "./labels";
import { PublishModal } from "./PublishModal";
import { ReleaseDetail } from "./ReleaseDetail";

/** P07 Release management: one release train for every delivery model (DM-5). */
export default function ReleasesPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const can = useStaffCan();
  const releases = useReleases();
  const rollouts = useRollouts();
  const [selected, setSelected] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<Release | null>(null);
  const canManage = can("ctl.release.manage");
  const items = useMemo(() => releases.data?.items ?? [], [releases.data]);
  const chosen = items.find((r) => r.id === selected);

  const columns = useMemo<DataTableProps<Release>["columns"]>(
    () => [
      {
        id: "version",
        accessorKey: "version",
        header: t("p07.col.version"),
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-medium">{row.original.version}</span>
            {row.original.notesAiDrafted && (
              <Badge tone="info">
                <Sparkles className="me-1 h-3 w-3" aria-hidden="true" />
                {t("p07.aiNotes")}
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: "channel",
        header: t("p07.col.channel"),
        enableSorting: false,
        cell: ({ row }) => t(CHANNEL_KEY[row.original.channel]),
      },
      {
        id: "status",
        header: t("p07.col.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = RELEASE_STATUS[row.original.status];
          return <Badge tone={s.tone}>{t(s.key)}</Badge>;
        },
      },
      {
        id: "published",
        header: t("p07.col.published"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.publishedAt ? fmt.date(row.original.publishedAt) : t("p07.notPublished"),
      },
      {
        id: "delivery",
        header: t("p07.col.delivery"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            <Badge tone={row.original.signed ? "success" : "warning"}>
              {t(row.original.signed ? "p07.signed" : "p07.unsigned")}
            </Badge>
            {row.original.offlineBundle && <Badge tone="neutral">{t("p07.bundle")}</Badge>}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("p07.openLabel", { version: row.original.version })}
              onClick={() => setSelected(row.original.id)}
            >
              {t("p07.open")}
            </Button>
            {canManage && row.original.status === "draft" && (
              <Button
                size="sm"
                variant="secondary"
                aria-label={t("p07.publishLabel", { version: row.original.version })}
                onClick={() => setPublishing(row.original)}
              >
                {t("p07.publish")}
              </Button>
            )}
          </span>
        ),
      },
    ],
    [t, fmt, canManage],
  );

  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p07.nav")}</h1>
      <DataTable
        caption={t("p07.caption")}
        columns={columns}
        data={items}
        getRowId={(r) => r.id}
        loading={releases.isPending}
        error={releases.isError ? <EmptyState tone="error" /> : undefined}
      />
      {chosen && (
        <ReleaseDetail
          release={chosen}
          rollouts={(rollouts.data?.items ?? []).filter((r) => r.releaseId === chosen.id)}
          canManage={canManage}
        />
      )}
      {publishing && <PublishModal release={publishing} onClose={() => setPublishing(null)} />}
    </div>
  );
}
