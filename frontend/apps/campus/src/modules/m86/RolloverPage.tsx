import { PromotionActionSchema } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAiSettings,
  useEntitlements,
  useMe,
  useRolloverDecisions,
  useRolloverRuns,
} from "@nexus/services";
import { Button, EmptyState, Skeleton } from "@nexus/ui-core";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { Forbidden } from "../../pages/Forbidden";
import { AssistPanel } from "../m11/AssistPanel";
import { PromotionDecisions } from "./PromotionDecisions";
import { RolloverRunList } from "./RolloverRunList";

function forbidden(error: unknown) {
  return error instanceof ApiRequestError && error.status === 403;
}

export function RolloverPage() {
  const t = useText();
  const online = useOnline();
  const me = useMe();
  const runs = useRolloverRuns();
  const entitlements = useEntitlements();
  const canRead = !!me.data?.permissions.includes("m86.rollover.read");
  const canAsk =
    canRead &&
    online &&
    !!me.data?.permissions.includes("m11.assist.use") &&
    !!entitlements.data?.items.some((entry) => entry.moduleId === "M11" && entry.enabled);
  const ai = useAiSettings(canAsk);
  const [assistOpen, setAssistOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const requested = params.get("run");
  const items = [...(runs.data?.items ?? [])].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const selected = items.find((run) => run.id === requested) ?? items[0];
  const selectedId =
    canRead && !forbidden(me.error) && !forbidden(runs.error) ? selected?.id : undefined;
  const decisions = useRolloverDecisions(selectedId ?? null);
  const filter = PromotionActionSchema.safeParse(params.get("action"));

  useEffect(() => {
    if (selectedId && selectedId !== requested) {
      const next = new URLSearchParams(params);
      next.set("run", selectedId);
      setParams(next, { replace: true });
    }
  }, [params, requested, selectedId, setParams]);

  if (
    forbidden(me.error) ||
    (me.data && !canRead) ||
    forbidden(runs.error) ||
    forbidden(decisions.error)
  ) {
    return <Forbidden />;
  }

  const change = (key: "run" | "action", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const loading = (
    <div role="status" aria-label={t("common.loading")}>
      <Skeleton className="h-24 w-full" />
    </div>
  );
  const failure = (retry: () => void) => (
    <EmptyState
      title={t("m86.page.failed")}
      tone="error"
      description={!online ? t("common.offline") : undefined}
      action={
        <Button variant="secondary" className="min-h-11" onClick={retry}>
          {t("common.retry")}
        </Button>
      }
    />
  );
  const showAssist = canAsk && ai.data?.enabled;
  return (
    <div className="min-w-0 space-y-6 break-words">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-page-title font-semibold text-text-primary">{t("m86.nav.title")}</h1>
          <p className="text-body text-text-secondary">{t("m86.page.intro")}</p>
          <LastSynced updatedAt={runs.dataUpdatedAt} />
        </div>
        {showAssist && (
          <div className="space-y-1">
            <Button className="min-h-11" variant="secondary" onClick={() => setAssistOpen(true)}>
              {t("m86.page.askAssist")}
            </Button>
            <p className="text-body-sm text-text-secondary">{t("m86.page.prompt")}</p>
          </div>
        )}
      </header>
      {(!me.data && (me.isError || !online)) || (!runs.data && (runs.isError || !online)) ? (
        failure(() => {
          void me.refetch();
          void runs.refetch();
        })
      ) : !me.data || !runs.data ? (
        loading
      ) : !selected ? (
        <EmptyState title={t("m86.page.empty")} />
      ) : (
        <>
          <RolloverRunList
            runs={items}
            selectedId={selected.id}
            onSelect={(id) => change("run", id)}
          />
          {decisions.data ? (
            <PromotionDecisions
              decisions={decisions.data.items}
              action={filter.success ? filter.data : ""}
              onAction={(value) => change("action", value)}
            />
          ) : decisions.isError || !online ? (
            failure(() => void decisions.refetch())
          ) : (
            loading
          )}
        </>
      )}
      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default RolloverPage;
