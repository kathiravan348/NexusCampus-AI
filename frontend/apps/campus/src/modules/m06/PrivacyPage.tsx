import { getDirection, useText } from "@nexus/i18n";
import { useMe } from "@nexus/services";
import { Button, EmptyState, Skeleton, Tabs } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";
import { AuditTab } from "./AuditTab";
import { ComplianceTab } from "./ComplianceTab";
import { ConsentsTab } from "./ConsentsTab";
import { DataRequestsTab } from "./DataRequestsTab";

/** Audit, privacy & consent (M06, L0 — online only, nothing cached on the device). */
export function PrivacyPage() {
  const t = useText();
  const { locale } = useRuntime();
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m06.privacy.error")}
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const can = new Set(me.data.permissions);
  const canSeeUsers = can.has("m02.user.read");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m06.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m06.privacy.intro")}</p>
      </header>
      <Tabs
        ariaLabel={t("m06.privacy.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="audit"
        items={[
          {
            value: "audit",
            label: t("m06.privacy.tabAudit"),
            content: <AuditTab canSeeUsers={canSeeUsers} />,
          },
          ...(can.has("m06.consent.manage")
            ? [
                {
                  value: "consents",
                  label: t("m06.privacy.tabConsents"),
                  content: <ConsentsTab canSeeUsers={canSeeUsers} />,
                },
              ]
            : []),
          ...(can.has("m06.request.manage")
            ? [
                {
                  value: "requests",
                  label: t("m06.privacy.tabRequests"),
                  content: <DataRequestsTab canSeeUsers={canSeeUsers} />,
                },
              ]
            : []),
          {
            value: "compliance",
            label: t("m06.privacy.tabCompliance"),
            content: <ComplianceTab />,
          },
        ]}
      />
    </div>
  );
}

export default PrivacyPage;
