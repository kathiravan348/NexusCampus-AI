import { useControlText } from "@nexus/i18n/control";
import { Tabs } from "@nexus/ui-core";
import { BreakGlassTab } from "./BreakGlassTab";
import { RequestsTab } from "./RequestsTab";
import { SessionsTab } from "./SessionsTab";

/** P10 Support access broker: request → the institution decides (M83) → time-boxed, recorded access. */
export default function AccessPage() {
  const t = useControlText();
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p10.nav")}
        </h1>
        <p className="max-w-prose text-body text-text-secondary">{t("p10.intro")}</p>
      </div>
      <Tabs
        ariaLabel={t("p10.tabs.label")}
        defaultValue="requests"
        items={[
          { value: "requests", label: t("p10.tab.requests"), content: <RequestsTab /> },
          { value: "sessions", label: t("p10.tab.sessions"), content: <SessionsTab /> },
          { value: "breakGlass", label: t("p10.tab.breakGlass"), content: <BreakGlassTab /> },
        ]}
      />
    </div>
  );
}
