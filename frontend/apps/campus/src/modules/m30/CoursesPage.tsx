import type { CourseSpaceKind, CourseSpaceStatus } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { useCourseSpaces } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { Archive, BookOpen, CheckCircle2, FilePenLine, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { CourseSpaceView } from "./CourseSpaceView";

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

/**
 * LMS classrooms & courses (M30, L2): lists the viewer's course spaces and opens a space view
 * with its outline, progress and discussions.
 */
export function CoursesPage() {
  const t = useText();
  const spaces = useCourseSpaces();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);

  const spaceList = spaces.data?.items ?? [];
  const selectedSpace = selectedSpaceId
    ? (spaceList.find((row) => row.id === selectedSpaceId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m30.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m30.page.intro")}</p>
        <LastSynced updatedAt={spaces.dataUpdatedAt} />
      </header>

      {selectedSpace ? (
        <CourseSpaceView space={selectedSpace} onBack={() => setSelectedSpaceId(null)} />
      ) : spaces.isPending && !spaces.data ? (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
          role="status"
          aria-label={t("common.loading")}
        >
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : spaces.isError && !spaces.data ? (
        <EmptyState
          tone="error"
          title={t("m30.spaces.error")}
          action={
            <Button variant="secondary" onClick={() => void spaces.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : spaceList.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title={t("m30.spaces.empty")}
          description={t("m30.spaces.emptyBody")}
        />
      ) : (
        <ul
          aria-label={t("m30.spaces.listLabel")}
          className="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          {spaceList.map((space) => {
            const statusMeta = STATUS_META[space.status];
            const StatusIcon = statusMeta.icon;
            return (
              <li key={space.id} className="min-w-0">
                <Card
                  headingAs="h2"
                  title={<span className="break-words">{space.title}</span>}
                  footer={
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={t("m30.spaces.openLabel", { title: space.title })}
                      onClick={() => setSelectedSpaceId(space.id)}
                    >
                      {t("m30.spaces.open")}
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{space.code}</Badge>
                      <Badge tone="info">{t(KIND_KEY[space.kind])}</Badge>
                      <Badge tone={statusMeta.tone}>
                        <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{t(statusMeta.key)}</span>
                      </Badge>
                      {space.selfEnrol && <Badge tone="brand">{t("m30.space.selfEnrol")}</Badge>}
                    </div>
                    {space.summary && (
                      <p className="break-words text-body-sm text-text-secondary">
                        {space.summary}
                      </p>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default CoursesPage;
