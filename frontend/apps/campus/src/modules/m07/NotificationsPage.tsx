import { getDirection, useText } from "@nexus/i18n";
import { useMe } from "@nexus/services";
import { Tabs } from "@nexus/ui-core";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { DeliveryLogTab } from "./DeliveryLogTab";
import { PreferencesTab } from "./PreferencesTab";
import { TemplatesTab } from "./TemplatesTab";

/** Notifications (M07, L1): templates and delivery log for managers; everyone sets their own preferences. */
export function NotificationsPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const canManage = me.data?.permissions.includes("m07.template.manage") ?? false;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m07.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m07.notifications.intro")}</p>
      </header>
      <Tabs
        ariaLabel={t("m07.notifications.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue={canManage ? "templates" : "prefs"}
        items={[
          ...(canManage
            ? [
                {
                  value: "templates",
                  label: t("m07.notifications.tabTemplates"),
                  content: <TemplatesTab online={online} />,
                },
                { value: "log", label: t("m07.notifications.tabLog"), content: <DeliveryLogTab /> },
              ]
            : []),
          { value: "prefs", label: t("m07.notifications.tabPrefs"), content: <PreferencesTab /> },
        ]}
      />
    </div>
  );
}

export default NotificationsPage;
