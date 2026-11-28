import type { ContentStatus } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { useContentItems } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { FileStack, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useRuntime } from "../../app/TenantRuntime";
import { CONTENT_KIND_META, CONTENT_STATUS_META, ContentItemView } from "./ContentItemView";

type StatusFilter = "all" | ContentStatus;

/**
 * Content authoring studio (M31, L2): lists learning content with status filtering and opens an
 * item view showing metadata, assets, lesson blocks, accessibility report and publishing actions.
 */
export function ContentPage() {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const items = useContentItems();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const allItems = useMemo(() => items.data?.items ?? [], [items.data?.items]);
  const selectedItem = selectedItemId
    ? (allItems.find((row) => row.id === selectedItemId) ?? null)
    : null;
  const visibleItems = useMemo(
    () =>
      statusFilter === "all" ? allItems : allItems.filter((row) => row.status === statusFilter),
    [allItems, statusFilter],
  );

  const statusOptions = [
    { value: "all", label: t("m31.library.allStatuses") },
    { value: "draft", label: t("m31.status.draft") },
    { value: "in_review", label: t("m31.status.inReview") },
    { value: "published", label: t("m31.status.published") },
    { value: "archived", label: t("m31.status.archived") },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m31.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m31.page.intro")}</p>
        <LastSynced updatedAt={items.dataUpdatedAt} />
      </header>

      {selectedItem ? (
        <ContentItemView item={selectedItem} onBack={() => setSelectedItemId(null)} />
      ) : items.isPending && !items.data ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          role="status"
          aria-label={t("common.loading")}
        >
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : items.isError && !items.data ? (
        <EmptyState
          tone="error"
          title={t("m31.library.error")}
          action={
            <Button variant="secondary" onClick={() => void items.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={<FileStack className="h-6 w-6" />}
          title={t("m31.library.empty")}
          description={t("m31.library.emptyBody")}
        />
      ) : (
        <div className="space-y-4">
          <Select
            label={t("m31.library.statusFilter")}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            options={statusOptions}
            containerClassName="w-full sm:max-w-xs"
          />

          {visibleItems.length === 0 ? (
            <EmptyState icon={<FileStack className="h-6 w-6" />} title={t("m31.library.noMatch")} />
          ) : (
            <ul
              aria-label={t("m31.library.listLabel")}
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              {visibleItems.map((item) => {
                const kindMeta = CONTENT_KIND_META[item.kind];
                const KindIcon = kindMeta.icon;
                const statusMeta = CONTENT_STATUS_META[item.status];
                const StatusIcon = statusMeta.icon;
                return (
                  <li key={item.id} className="min-w-0">
                    <Card
                      headingAs="h2"
                      title={<span className="break-words">{item.title}</span>}
                      footer={
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={t("m31.library.openLabel", { title: item.title })}
                          onClick={() => setSelectedItemId(item.id)}
                        >
                          {t("m31.library.open")}
                        </Button>
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">
                          <KindIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{t(kindMeta.key)}</span>
                        </Badge>
                        <Badge tone={statusMeta.tone}>
                          <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{t(statusMeta.key)}</span>
                        </Badge>
                        <Badge tone="neutral">
                          {t("m31.item.version", {
                            version: formatNumber(item.version, safeLocale),
                          })}
                        </Badge>
                        {item.aiAssisted && (
                          <Badge tone="brand">
                            <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span>{t("m31.item.aiAssisted")}</span>
                          </Badge>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default ContentPage;
