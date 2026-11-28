import type { CourseItem, CourseItemKind } from "@nexus/contracts";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { useCourseItems, useCourseModules, useCourseProgress } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Meter, Skeleton } from "@nexus/ui-core";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  FileText,
  MessageSquare,
  Paperclip,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";

const PROGRESS_THRESHOLDS = { warning: 2, danger: 2 };

const ITEM_KIND_META: Readonly<
  Record<CourseItemKind, { readonly key: MessageKey; readonly icon: LucideIcon }>
> = {
  page: { key: "m30.itemKind.page", icon: FileText },
  file: { key: "m30.itemKind.file", icon: Paperclip },
  link: { key: "m30.itemKind.link", icon: ExternalLink },
  content: { key: "m30.itemKind.content", icon: BookOpen },
  assignment: { key: "m30.itemKind.assignment", icon: ClipboardList },
  test: { key: "m30.itemKind.test", icon: ClipboardCheck },
  live_session: { key: "m30.itemKind.liveSession", icon: Video },
  discussion: { key: "m30.itemKind.discussion", icon: MessageSquare },
};

export interface CourseOutlineProps {
  readonly courseSpaceId: string;
  readonly isStaff: boolean;
}

/**
 * Course outline tab: ordered modules and items with completion rules, text prerequisites,
 * own progress meter for learners, and aggregate-only progress counts for staff.
 */
export function CourseOutline({ courseSpaceId, isStaff }: CourseOutlineProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const modules = useCourseModules(courseSpaceId);
  const items = useCourseItems(courseSpaceId);
  const progress = useCourseProgress(courseSpaceId);

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  const sortedModules = useMemo(
    () => [...(modules.data?.items ?? [])].sort((a, b) => a.order - b.order),
    [modules.data?.items],
  );
  const moduleTitleById = useMemo(
    () => new Map(sortedModules.map((row) => [row.id, row.title])),
    [sortedModules],
  );
  const itemsByModule = useMemo(() => {
    const grouped = new Map<string, CourseItem[]>();
    for (const item of items.data?.items ?? []) {
      const list = grouped.get(item.moduleId);
      if (list) list.push(item);
      else grouped.set(item.moduleId, [item]);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return grouped;
  }, [items.data?.items]);

  const progressRows = useMemo(() => progress.data?.items ?? [], [progress.data?.items]);
  const ownProgress = !isStaff ? (progressRows[0] ?? null) : null;
  const completedIds = useMemo(
    () => new Set(ownProgress?.completedItemIds ?? []),
    [ownProgress?.completedItemIds],
  );
  const doneCountByItem = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of progressRows) {
      for (const itemId of row.completedItemIds) {
        counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
      }
    }
    return counts;
  }, [progressRows]);

  const loading =
    (modules.isPending && !modules.data) ||
    (items.isPending && !items.data) ||
    (progress.isPending && !progress.data);
  const failed =
    (modules.isError && !modules.data) ||
    (items.isError && !items.data) ||
    (progress.isError && !progress.data);

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (failed) {
    return (
      <EmptyState
        tone="error"
        title={t("m30.outline.error")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void modules.refetch();
              void items.refetch();
              void progress.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const allItems = items.data?.items ?? [];
  const requiredItems = allItems.filter((item) => item.required);
  const completedRequired = requiredItems.filter((item) => completedIds.has(item.id)).length;
  const percentBps = ownProgress?.percentBps ?? 0;
  const percentText = formatNumber(percentBps / 100, safeLocale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  function completionLabel(item: CourseItem): string {
    if (item.completion === "none") return t("m30.completion.none");
    if (item.completion === "view") return t("m30.completion.view");
    if (item.completion === "submit") return t("m30.completion.submit");
    const passPct = formatNumber((item.passMarkBps ?? 0) / 100, safeLocale, {
      maximumFractionDigits: 1,
    });
    return t("m30.completion.pass", { percent: passPct });
  }

  function renderItem(item: CourseItem) {
    const kindMeta = ITEM_KIND_META[item.kind];
    const KindIcon = kindMeta.icon;
    const itemDone = completedIds.has(item.id);
    const staffDone = doneCountByItem.get(item.id) ?? 0;
    const staffTone = staffDone === progressRows.length ? "success" : "neutral";

    return (
      <li
        key={item.id}
        className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border-default bg-bg-raised p-3"
      >
        <div className="min-w-0 space-y-1">
          <p className="break-words text-body font-medium text-text-primary">{item.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <KindIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t(kindMeta.key)}</span>
            </span>
            <span>{completionLabel(item)}</span>
            {item.dueAt && (
              <span>
                {t("m30.outline.dueAt", {
                  time: formatDateTime(item.dueAt, { locale: safeLocale, timeZone }),
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!item.published && <Badge tone="warning">{t("m30.outline.unpublished")}</Badge>}
          {!isStaff && itemDone && (
            <Badge tone="success">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t("m30.outline.done")}</span>
            </Badge>
          )}
          {isStaff && progressRows.length > 0 && (
            <Badge tone={staffTone}>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t("m30.outline.doneCount", {
                  done: formatNumber(staffDone, safeLocale),
                  total: formatNumber(progressRows.length, safeLocale),
                })}
              </span>
            </Badge>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-4">
      {isStaff ? (
        <Card headingAs="h3" title={t("m30.outline.staffProgressHeading")}>
          <p className="text-body text-text-secondary">
            {t("m30.outline.staffProgressCount", { count: progressRows.length })}
          </p>
        </Card>
      ) : (
        <Card>
          <Meter
            label={t("m30.outline.progressLabel")}
            value={percentBps}
            max={10000}
            thresholds={PROGRESS_THRESHOLDS}
            valueText={
              requiredItems.length > 0
                ? t("m30.outline.progressValue", {
                    percent: percentText,
                    completed: formatNumber(completedRequired, safeLocale),
                    total: formatNumber(requiredItems.length, safeLocale),
                  })
                : t("m30.outline.progressPercent", { percent: percentText })
            }
          />
        </Card>
      )}

      {sortedModules.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title={t("m30.outline.empty")}
          description={t("m30.outline.emptyBody")}
        />
      ) : (
        <div className="space-y-4">
          {sortedModules.map((courseModule) => {
            const moduleItems = itemsByModule.get(courseModule.id) ?? [];
            const prereqNames = courseModule.prerequisiteModuleIds
              .map((id) => moduleTitleById.get(id) ?? id)
              .join(", ");

            return (
              <Card
                key={courseModule.id}
                headingAs="h3"
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words">{courseModule.title}</span>
                    {courseModule.unlockOn && (
                      <Badge tone="neutral">
                        {t("m30.outline.unlocksOn", {
                          date: formatDate(courseModule.unlockOn, { locale: safeLocale }),
                        })}
                      </Badge>
                    )}
                  </span>
                }
              >
                <div className="space-y-3">
                  {prereqNames && (
                    <p className="break-words text-body-sm text-text-secondary">
                      {t("m30.outline.prerequisites", { modules: prereqNames })}
                    </p>
                  )}

                  {moduleItems.length === 0 ? (
                    <p className="text-body-sm text-text-muted">{t("m30.outline.noItems")}</p>
                  ) : (
                    <ol className="space-y-2.5">{moduleItems.map(renderItem)}</ol>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
