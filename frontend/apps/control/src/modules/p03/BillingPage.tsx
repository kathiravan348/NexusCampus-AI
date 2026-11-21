import { useControlText } from "@nexus/i18n/control";
import { Tabs } from "@nexus/ui-core";
import { DunningTab } from "./DunningTab";
import { InvoicesTab } from "./InvoicesTab";
import { PaymentsTab } from "./PaymentsTab";
import { SubscriptionsTab } from "./SubscriptionsTab";

/** P03 Subscription billing. */
export default function BillingPage() {
  const t = useControlText();
  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p03.nav")}</h1>
      <Tabs
        ariaLabel={t("p03.tabs.label")}
        defaultValue="invoices"
        items={[
          { value: "invoices", label: t("p03.tab.invoices"), content: <InvoicesTab /> },
          {
            value: "subscriptions",
            label: t("p03.tab.subscriptions"),
            content: <SubscriptionsTab />,
          },
          { value: "payments", label: t("p03.tab.payments"), content: <PaymentsTab /> },
          { value: "dunning", label: t("p03.tab.dunning"), content: <DunningTab /> },
        ]}
      />
    </div>
  );
}
