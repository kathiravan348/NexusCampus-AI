import { getDirection, useText } from "@nexus/i18n";
import { useAccessRequests, useMe } from "@nexus/services";
import { Badge, Tabs } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";
import { BreakGlassTab } from "./BreakGlassTab";
import { GrantsTab } from "./GrantsTab";
import { KeysTab } from "./KeysTab";
import { RequestsTab } from "./RequestsTab";

/**
 * Data vault & provider access (M83, L0, D22). AI-blocked: the registry sets `aiBlocked`, so the Assist
 * button is hidden here and nothing on these screens is sent to AI (A-3).
 */
export function VaultPage() {
  const t = useText();
  const { locale } = useRuntime();
  const me = useMe();
  const requests = useAccessRequests();
  const canDecide = me.data?.permissions.includes("m83.grant.approve") ?? false;
  const pending = requests.data?.items.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m83.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m83.vault.intro")}</p>
      </header>
      <Tabs
        ariaLabel={t("m83.vault.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="requests"
        items={[
          {
            value: "requests",
            label: (
              <span className="flex items-center gap-2">
                {t("m83.vault.tabRequests")}
                {pending > 0 && (
                  <Badge
                    tone="warning"
                    aria-label={t("m83.vault.pendingCount", { count: pending })}
                  >
                    {pending}
                  </Badge>
                )}
              </span>
            ),
            content: <RequestsTab canDecide={canDecide} />,
          },
          {
            value: "grants",
            label: t("m83.vault.tabGrants"),
            content: <GrantsTab canRevoke={canDecide} />,
          },
          { value: "keys", label: t("m83.vault.tabKeys"), content: <KeysTab /> },
          { value: "breakGlass", label: t("m83.vault.tabBreakGlass"), content: <BreakGlassTab /> },
        ]}
      />
    </div>
  );
}

export default VaultPage;
