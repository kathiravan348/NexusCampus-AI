import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAiSettings,
  useEntitlements,
  useMe,
  useRoleHome,
} from "@nexus/services";
import { Button, EmptyState, Skeleton } from "@nexus/ui-core";
import { useMemo, useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { useShellContext } from "../../app/Shell";
import { Forbidden } from "../../pages/Forbidden";
import { AssistPanel } from "../m11/AssistPanel";
import { ChildSwitcher } from "./ChildSwitcher";
import { HomeCards } from "./HomeCards";

function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403;
}

export function FamilyPortalPage() {
  const t = useText();
  const online = useOnline();
  const me = useMe();
  const entitlements = useEntitlements();
  const home = useRoleHome();
  const { visibleModules } = useShellContext();
  const [assistOpen, setAssistOpen] = useState(false);

  const visibleModuleIds = useMemo(
    () => new Set(visibleModules.map((entry) => entry.moduleId)),
    [visibleModules],
  );

  const canAsk =
    online &&
    !!me.data?.permissions.includes("m11.assist.use") &&
    !!entitlements.data?.items.some((entry) => entry.moduleId === "M11" && entry.enabled);
  const ai = useAiSettings(canAsk);

  if (isForbidden(home.error) || isForbidden(me.error)) return <Forbidden />;
  if (home.data !== undefined && home.data.role !== "family") return <Forbidden />;

  const showAssist = home.data?.role === "family" && canAsk && !!ai.data?.enabled;

  return (
    <div className="min-w-0 space-y-6 break-words">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-page-title font-semibold text-text-primary">{t("m25.nav.title")}</h1>
          <p className="text-body text-text-secondary">{t("m25.page.intro")}</p>
          <LastSynced updatedAt={home.dataUpdatedAt} />
        </div>
        {showAssist && (
          <Button className="min-h-11" variant="secondary" onClick={() => setAssistOpen(true)}>
            {t("m25.page.askAssist")}
          </Button>
        )}
      </header>
      {(home.isError || !online) && !home.data ? (
        <EmptyState
          tone="error"
          title={t("m25.page.failed")}
          description={!online ? t("common.offline") : undefined}
          action={
            <Button className="min-h-11" variant="secondary" onClick={() => void home.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : !home.data ? (
        <div role="status" aria-label={t("common.loading")} className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <ChildSwitcher learnerIds={home.data.learnerIds} visibleModuleIds={visibleModuleIds} />
          <HomeCards cards={home.data.cards} childCount={home.data.learnerIds.length} />
        </div>
      )}
      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default FamilyPortalPage;
