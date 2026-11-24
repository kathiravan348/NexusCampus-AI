import { getDirection, useText } from "@nexus/i18n";
import { useAiSettings, useEntitlements, useMe, useTimetableSlots } from "@nexus/services";
import { Button, EmptyState, Skeleton, Tabs, type TabItem } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { AssistPanel } from "../m11/AssistPanel";
import { LoadTab } from "./LoadTab";
import { RoomsTab } from "./RoomsTab";
import { WeekTab } from "./WeekTab";

/**
 * Timetable & scheduling (M16, L1): weekly class schedule, rooms & bell schedules, and staff-only
 * teacher load. Cached reads stay available offline; adding slots requires a connection and
 * `m16.timetable.manage`.
 */
export function TimetablePage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const entitlements = useEntitlements();
  const slots = useTimetableSlots();
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
        title={t("m16.page.error")}
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const permissions = new Set(me.data.permissions);
  const canManage = permissions.has("m16.timetable.manage");
  const isStaff = me.data.roleProfiles.some((profile) => profile.kind === "staff");
  const showAssist = online && m11Entitled && canAskAssist && (aiSettings.data?.enabled ?? false);

  const tabItems: TabItem[] = [
    {
      value: "week",
      label: t("m16.page.tabWeek"),
      content: <WeekTab canManage={canManage} online={online} isStaff={isStaff} />,
    },
    {
      value: "rooms",
      label: t("m16.page.tabRooms"),
      content: <RoomsTab />,
    },
    ...(isStaff
      ? [
          {
            value: "load",
            label: t("m16.page.tabLoad"),
            content: <LoadTab />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("m16.nav.title")}
          </h1>
          <p className="text-body text-text-secondary">{t("m16.page.intro")}</p>
          <LastSynced updatedAt={slots.dataUpdatedAt} />
        </div>
        {showAssist && (
          <Button variant="secondary" size="sm" onClick={() => setAssistOpen(true)}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t("m16.page.askAssist")}
          </Button>
        )}
      </header>

      <Tabs
        ariaLabel={t("m16.page.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="week"
        items={tabItems}
      />

      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default TimetablePage;
