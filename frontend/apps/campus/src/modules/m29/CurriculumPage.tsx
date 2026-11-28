import { getDirection, useText } from "@nexus/i18n";
import { useAiSettings, useEntitlements, useMe, useOutcomeFrameworks } from "@nexus/services";
import { Button, EmptyState, Skeleton, Tabs, type TabItem } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { AssistPanel } from "../m11/AssistPanel";
import { LessonPlansTab } from "./LessonPlansTab";
import { OutcomesTab } from "./OutcomesTab";
import { SyllabusTab } from "./SyllabusTab";

/**
 * Curriculum & lesson planning (M29, L2): outcome frameworks with trees and CO–PO mappings,
 * syllabus units with coverage per offering, and draft lesson plans saved via the offline outbox.
 */
export function CurriculumPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const entitlements = useEntitlements();
  const frameworks = useOutcomeFrameworks();
  const [assistOpen, setAssistOpen] = useState(false);

  const m11Entitled =
    entitlements.data?.items.some((entry) => entry.moduleId === "M11" && entry.enabled) ?? false;
  const canAskAssist = me.data?.permissions.includes("m11.assist.use") ?? false;
  const aiSettings = useAiSettings(online && m11Entitled && canAskAssist);

  if (me.isPending && !me.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (me.isError && !me.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m29.page.error")}
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const permissions = new Set(me.data.permissions);
  const canWritePlans = permissions.has("m29.lessonplan.write");
  const canReviewPlans = permissions.has("m29.lessonplan.review");
  const showLessonPlans = canWritePlans || canReviewPlans;
  const ownStaffProfileId =
    me.data.roleProfiles.find(
      (profile) =>
        profile.tenantId === me.data.user.tenantId &&
        profile.kind === "staff" &&
        profile.status === "active",
    )?.id ?? null;
  const showAssist = online && m11Entitled && canAskAssist && (aiSettings.data?.enabled ?? false);

  const tabItems: TabItem[] = [
    {
      value: "outcomes",
      label: t("m29.page.tabOutcomes"),
      content: <OutcomesTab />,
    },
    {
      value: "syllabus",
      label: t("m29.page.tabSyllabus"),
      content: <SyllabusTab />,
    },
    ...(showLessonPlans
      ? [
          {
            value: "lesson-plans",
            label: t("m29.page.tabLessonPlans"),
            content: (
              <LessonPlansTab canWrite={canWritePlans} ownStaffProfileId={ownStaffProfileId} />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("m29.nav.title")}
          </h1>
          <p className="text-body text-text-secondary">{t("m29.page.intro")}</p>
          <LastSynced updatedAt={frameworks.dataUpdatedAt} />
        </div>
        {showAssist && (
          <Button variant="secondary" size="sm" onClick={() => setAssistOpen(true)}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t("m29.page.askAssist")}
          </Button>
        )}
      </header>

      <Tabs
        ariaLabel={t("m29.page.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="outcomes"
        items={tabItems}
      />

      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default CurriculumPage;
