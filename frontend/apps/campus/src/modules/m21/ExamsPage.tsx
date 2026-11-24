import { getDirection, useText } from "@nexus/i18n";
import { useHallTickets, useMe } from "@nexus/services";
import { Tabs, type TabItem } from "@nexus/ui-core";
import { LastSynced } from "../../app/LastSynced";
import { useRuntime } from "../../app/TenantRuntime";
import { Forbidden } from "../../pages/Forbidden";
import { readState, ScheduleTab } from "./ScheduleTab";
import { SeatingTab } from "./SeatingTab";
import { TicketsTab } from "./TicketsTab";

export function ExamsPage() {
  const t = useText();
  const { locale } = useRuntime();
  const me = useMe();
  const tickets = useHallTickets();
  const state = readState(tickets) ?? readState(me);
  if (state === "common.shell.forbiddenTitle") return <Forbidden />;
  if (state) return <p role="status">{t(state)}</p>;

  const staff = me.data?.permissions.includes("m21.exams.read") ?? false;
  const manage = me.data?.permissions.includes("m21.exams.manage") ?? false;
  const tabs: TabItem[] = [];
  if (staff) {
    tabs.push(
      { value: "schedule", label: t("m21.page.schedule"), content: <ScheduleTab /> },
      {
        value: "seating",
        label: t("m21.page.seating"),
        content: <SeatingTab canManage={manage} />,
      },
    );
  }
  tabs.push({
    value: "tickets",
    label: t("m21.page.tickets"),
    content: <TicketsTab staff={staff} />,
  });
  return (
    <div className="min-w-0 space-y-6 break-words">
      <header className="space-y-1">
        <h1 className="text-page-title font-semibold text-text-primary">{t("m21.nav.title")}</h1>
        <p className="text-body text-text-secondary">{t("m21.page.intro")}</p>
        <LastSynced updatedAt={tickets.dataUpdatedAt} />
      </header>
      <div className="[&_[role=tablist]]:h-auto [&_[role=tablist]]:max-w-full [&_[role=tablist]]:flex-wrap [&_[role=tab]]:min-h-11 [&_[role=tab]]:whitespace-normal">
        <Tabs
          key={String(staff)}
          ariaLabel={t("m21.nav.title")}
          dir={getDirection(locale)}
          defaultValue={staff ? "schedule" : "tickets"}
          items={tabs}
        />
      </div>
    </div>
  );
}

export default ExamsPage;
