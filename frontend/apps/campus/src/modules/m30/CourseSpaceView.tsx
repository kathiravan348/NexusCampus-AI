import type { CourseSpace, CourseSpaceKind, CourseSpaceStatus } from "@nexus/contracts";
import {
  formatDate,
  getDirection,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { useMe } from "@nexus/services";
import { Badge, Button, Skeleton, Tabs, type TabItem } from "@nexus/ui-core";
import { Archive, ArrowLeft, CheckCircle2, FilePenLine, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { CourseOutline } from "./CourseOutline";
import { DiscussionsTab } from "./DiscussionsTab";

const KIND_KEY: Readonly<Record<CourseSpaceKind, MessageKey>> = {
  class: "m30.spaceKind.class",
  course: "m30.spaceKind.course",
  community: "m30.spaceKind.community",
};

const STATUS_META: Readonly<
  Record<
    CourseSpaceStatus,
    {
      readonly key: MessageKey;
      readonly icon: LucideIcon;
      readonly tone: "neutral" | "success" | "warning";
    }
  >
> = {
  draft: { key: "m30.spaceStatus.draft", icon: FilePenLine, tone: "neutral" },
  published: { key: "m30.spaceStatus.published", icon: CheckCircle2, tone: "success" },
  archived: { key: "m30.spaceStatus.archived", icon: Archive, tone: "warning" },
};

export interface CourseSpaceViewProps {
  readonly space: CourseSpace;
  readonly onBack: () => void;
}

/** Selected course space header, back navigation, and Outline / Discussions tabs. */
export function CourseSpaceView({ space, onBack }: CourseSpaceViewProps) {
  const t = useText();
  const { locale } = useRuntime();
  const me = useMe();

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const statusMeta = STATUS_META[space.status];
  const StatusIcon = statusMeta.icon;

  const { canModerate, isStaff, ownProfileIds } = useMemo(() => {
    const permissions = new Set(me.data?.permissions ?? []);
    const tenantId = me.data?.user.tenantId ?? space.tenantId;
    const activeProfiles = (me.data?.roleProfiles ?? []).filter(
      (profile) => profile.tenantId === tenantId && profile.status === "active",
    );
    return {
      canModerate: permissions.has("m30.discussion.moderate"),
      isStaff:
        permissions.has("m30.course.manage") ||
        activeProfiles.some((profile) => profile.kind === "staff"),
      ownProfileIds: new Set(activeProfiles.map((profile) => profile.id)),
    };
  }, [me.data, space.tenantId]);

  const dateRange =
    space.startsOn && space.endsOn
      ? t("m30.space.dates", {
          start: formatDate(space.startsOn, { locale: safeLocale }),
          end: formatDate(space.endsOn, { locale: safeLocale }),
        })
      : null;

  const tabItems: TabItem[] = [
    {
      value: "outline",
      label: t("m30.space.tabOutline"),
      content: <CourseOutline courseSpaceId={space.id} isStaff={isStaff} />,
    },
    {
      value: "discussions",
      label: t("m30.space.tabDiscussions"),
      content: (
        <DiscussionsTab
          courseSpaceId={space.id}
          canModerate={canModerate}
          ownProfileIds={ownProfileIds}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
          <span>{t("m30.space.back")}</span>
        </Button>
      </div>

      <section className="space-y-2 rounded-lg border border-border-default bg-bg-surface p-4">
        <h2 className="break-words font-sans text-section-title font-semibold text-text-primary">
          {space.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{space.code}</Badge>
          <Badge tone="info">{t(KIND_KEY[space.kind])}</Badge>
          <Badge tone={statusMeta.tone}>
            <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t(statusMeta.key)}</span>
          </Badge>
          {space.selfEnrol && <Badge tone="brand">{t("m30.space.selfEnrol")}</Badge>}
        </div>
        {dateRange && <p className="text-body-sm text-text-muted">{dateRange}</p>}
        {space.summary && (
          <p className="break-words text-body-sm text-text-secondary">{space.summary}</p>
        )}
      </section>

      {me.isPending && !me.data ? (
        <div className="space-y-3" role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <Tabs
          ariaLabel={t("m30.space.tabsLabel")}
          dir={getDirection(locale)}
          defaultValue="outline"
          items={tabItems}
        />
      )}
    </div>
  );
}
