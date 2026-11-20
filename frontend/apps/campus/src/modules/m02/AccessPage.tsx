import { getDirection, useText } from "@nexus/i18n";
import { useMe, useUsers } from "@nexus/services";
import { Button, EmptyState, Skeleton, Tabs } from "@nexus/ui-core";
import { WifiOff } from "lucide-react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { RolesTab } from "./RolesTab";
import { SessionsTab } from "./SessionsTab";
import { SsoTab } from "./SsoTab";
import { UsersTab } from "./UsersTab";

/** Users & access (M02, L1): Users · Roles · Sessions · SSO, each shown only with its permission. */
export function AccessPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const users = useUsers(); // same cache as UsersTab: the screen's main data

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
        title={t("m02.access.error")}
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const can = new Set(me.data.permissions);
  const selfUserId = me.data.user.id;
  const canInvite = can.has("m02.user.invite");
  const canManageRoles = can.has("m02.role.manage");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m02.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m02.access.intro")}</p>
        <LastSynced updatedAt={users.dataUpdatedAt} />
      </header>

      {!online && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border-default bg-warning-subtle px-4 py-3 text-body-sm font-medium text-warning-text"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("m02.access.offlineNotice")}</span>
        </div>
      )}

      <Tabs
        ariaLabel={t("m02.access.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="users"
        items={[
          {
            value: "users",
            label: t("m02.access.tabUsers"),
            content: (
              <UsersTab
                canInvite={canInvite}
                canManageRoles={canManageRoles}
                online={online}
                selfUserId={selfUserId}
              />
            ),
          },
          ...(canManageRoles
            ? [
                {
                  value: "roles",
                  label: t("m02.access.tabRoles"),
                  content: <RolesTab online={online} />,
                },
              ]
            : []),
          {
            value: "sessions",
            label: t("m02.access.tabSessions"),
            content: <SessionsTab online={online} showUser={canInvite} selfUserId={selfUserId} />,
          },
          ...(can.has("m02.sso.manage")
            ? [{ value: "sso", label: t("m02.access.tabSso"), content: <SsoTab online={online} /> }]
            : []),
        ]}
      />
    </div>
  );
}

export default AccessPage;
