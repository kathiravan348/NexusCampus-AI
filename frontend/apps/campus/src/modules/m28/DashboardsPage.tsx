import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAiSettings,
  useDashboardKpis,
  useEntitlements,
  useMe,
} from "@nexus/services";
import { Button, EmptyState, Skeleton } from "@nexus/ui-core";
import { useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { Forbidden } from "../../pages/Forbidden";
import { AssistPanel } from "../m11/AssistPanel";
import { KpiTile } from "./KpiTile";

export function DashboardsPage() {
  const t = useText();
  const online = useOnline();
  const metrics = useDashboardKpis();
  const me = useMe();
  const entitlements = useEntitlements();
  const [assistOpen, setAssistOpen] = useState(false);
  const canAsk =
    online &&
    !!me.data?.permissions.includes("m11.assist.use") &&
    !!entitlements.data?.items.some((entry) => entry.moduleId === "M11" && entry.enabled);
  const ai = useAiSettings(canAsk);

  if (
    (metrics.error instanceof ApiRequestError && metrics.error.status === 403) ||
    (me.error instanceof ApiRequestError && me.error.status === 403) ||
    (me.data && !me.data.permissions.includes("m28.dashboards.read"))
  ) {
    return <Forbidden />;
  }

  const showAssist = metrics.data !== undefined && canAsk && !!ai.data?.enabled;

  return (
    <div className="min-w-0 space-y-6 break-words">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-page-title font-semibold text-text-primary">{t("m28.nav.title")}</h1>
          <p className="text-body text-text-secondary">{t("m28.page.intro")}</p>
          <LastSynced updatedAt={metrics.dataUpdatedAt} />
        </div>
        {showAssist && (
          <div className="space-y-1">
            <Button className="min-h-11" variant="secondary" onClick={() => setAssistOpen(true)}>
              {t("m28.page.askAssist")}
            </Button>
            <p className="text-body-sm text-text-secondary">{t("m28.page.prompt")}</p>
          </div>
        )}
      </header>
      {metrics.data === undefined ? (
        metrics.isError || !online ? (
          <EmptyState
            tone="error"
            title={t("m28.page.failed")}
            description={!online ? t("common.offline") : undefined}
            action={
              <Button
                className="min-h-11"
                variant="secondary"
                onClick={() => void metrics.refetch()}
              >
                {t("common.retry")}
              </Button>
            }
          />
        ) : (
          <div role="status" aria-label={t("common.loading")} className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )
      ) : metrics.data.length === 0 ? (
        <EmptyState title={t("m28.page.empty")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.data.map((kpi) => (
            <KpiTile key={kpi.code} kpi={kpi} />
          ))}
        </ul>
      )}
      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default DashboardsPage;
