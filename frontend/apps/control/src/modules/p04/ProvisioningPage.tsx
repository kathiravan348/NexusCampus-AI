import { useControlText } from "@nexus/i18n/control";
import { Tabs } from "@nexus/ui-core";
import { NewTenantsTab } from "./NewTenantsTab";
import { OffboardingTab } from "./OffboardingTab";

/** P04 Tenant provisioning & offboarding. */
export default function ProvisioningPage() {
  const t = useControlText();
  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p04.nav")}</h1>
      <Tabs
        ariaLabel={t("p04.tabs.label")}
        defaultValue="new"
        items={[
          { value: "new", label: t("p04.tab.new"), content: <NewTenantsTab /> },
          { value: "offboarding", label: t("p04.tab.offboarding"), content: <OffboardingTab /> },
        ]}
      />
    </div>
  );
}
