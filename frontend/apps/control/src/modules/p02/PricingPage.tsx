import { useControlText } from "@nexus/i18n/control";
import { Tabs } from "@nexus/ui-core";
import { CatalogueTab } from "./CatalogueTab";
import { QuotesTab } from "./QuotesTab";

/** P02 Plans, pricing & quotes. */
export default function PricingPage() {
  const t = useControlText();
  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p02.nav")}</h1>
      <Tabs
        ariaLabel={t("p02.tabs.label")}
        defaultValue="catalogue"
        items={[
          { value: "catalogue", label: t("p02.tab.catalogue"), content: <CatalogueTab /> },
          { value: "quotes", label: t("p02.tab.quotes"), content: <QuotesTab /> },
        ]}
      />
    </div>
  );
}
