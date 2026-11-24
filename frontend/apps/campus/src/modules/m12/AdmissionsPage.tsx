import { getDirection, useText } from "@nexus/i18n";
import { useAiSettings, useEntitlements, useMe, useEnquiries } from "@nexus/services";
import { Button, EmptyState, Skeleton, Tabs } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { AssistPanel } from "../m11/AssistPanel";
import { EnquiriesTab } from "./EnquiriesTab";
import { OffersTab } from "./OffersTab";
import { ApplicationsTab } from "./ApplicationsTab";

export function AdmissionsPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const entitlements = useEntitlements();
  const enquiries = useEnquiries();
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
        title={t("m12.page.error")}
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const permissions = new Set(me.data.permissions);
  const canManage = permissions.has("m12.admissions.manage");
  const showAssist = online && m11Entitled && canAskAssist && (aiSettings.data?.enabled ?? false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("m12.nav.title")}
          </h1>
          <p className="text-body text-text-secondary">{t("m12.page.intro")}</p>
          <LastSynced updatedAt={enquiries.dataUpdatedAt} />
        </div>
        {showAssist && (
          <Button variant="secondary" size="sm" onClick={() => setAssistOpen(true)}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t("m12.page.askAssist")}
          </Button>
        )}
      </header>

      <Tabs
        ariaLabel={t("m12.page.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="enquiries"
        items={[
          {
            value: "enquiries",
            label: t("m12.page.tabEnquiries"),
            content: <EnquiriesTab canManage={canManage} online={online} />,
          },
          {
            value: "applications",
            label: t("m12.page.tabApplications"),
            content: <ApplicationsTab />,
          },
          {
            value: "offers",
            label: t("m12.page.tabOffers"),
            content: <OffersTab />,
          },
        ]}
      />

      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default AdmissionsPage;
