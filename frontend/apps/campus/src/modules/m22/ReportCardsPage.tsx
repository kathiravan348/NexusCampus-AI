import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAiSettings,
  useClassGroups,
  useEntitlements,
  useMe,
  useReportCards,
} from "@nexus/services";
import { Button, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { Forbidden } from "../../pages/Forbidden";
import { AssistPanel } from "../m11/AssistPanel";
import { useLearnerNames } from "../m18/InvoicesTab";
import { ReportCardList } from "./ReportCardList";
import { ReportCardView } from "./ReportCardView";

export function ReportCardsPage() {
  const t = useText();
  const online = useOnline();
  const me = useMe();
  const entitlements = useEntitlements();
  const canAsk =
    online &&
    !!me.data?.permissions.includes("m11.assist.use") &&
    !!entitlements.data?.items.some((entry) => entry.moduleId === "M11" && entry.enabled);
  const ai = useAiSettings(canAsk);
  const [assistOpen, setAssistOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [params, setParams] = useSearchParams();
  const cardId = params.get("card");
  const staff = !!me.data?.permissions.includes("m22.reports.read");
  const groups = useClassGroups();
  const names = useLearnerNames(true);
  const cards = useReportCards(null, (staff && groupId) || null);
  const forbidden = (error: unknown) => error instanceof ApiRequestError && error.status === 403;
  if (forbidden(cards.error) || forbidden(me.error)) return <Forbidden />;

  const changeCard = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete("card");
    else next.set("card", id);
    setParams(next);
  };
  const items = (cards.data?.items ?? []).filter((card) => staff || card.status === "published");
  const learners =
    groupId && staff
      ? [...new Set(items.map((card) => card.learnerId))]
      : [...new Set([...names.keys(), ...items.map((card) => card.learnerId)])];
  // A deep link can only select a card returned by the viewer-scoped report query.
  const selected = items.find((card) => card.id === cardId);
  const showAssist = canAsk && ai.data?.enabled;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-page-title font-semibold text-text-primary">{t("m22.nav.title")}</h1>
          <p className="text-body text-text-secondary">{t("m22.page.intro")}</p>
          <LastSynced updatedAt={cards.dataUpdatedAt} />
        </div>
        {showAssist && (
          <Button className="min-h-11" variant="secondary" onClick={() => setAssistOpen(true)}>
            {t("m22.page.askAssist")}
          </Button>
        )}
      </header>
      {cardId === null && me.data && (
        <div className="grid gap-3 sm:grid-cols-2">
          {staff && (
            <Select
              label={t("m22.filter.group")}
              className="min-h-11"
              value={groupId}
              options={[
                { value: "", label: t("m22.filter.allGroups") },
                ...(groups.data?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
              ]}
              onChange={(event) => {
                setGroupId(event.target.value);
                setLearnerId("");
              }}
            />
          )}
          {(staff || learners.length > 1) && (
            <Select
              label={t("m22.filter.learner")}
              className="min-h-11"
              value={learnerId}
              options={[
                { value: "", label: t("m22.filter.allLearners") },
                ...learners.map((id) => ({
                  value: id,
                  label: names.get(id) ?? t("term.learner"),
                })),
              ]}
              onChange={(event) => setLearnerId(event.target.value)}
            />
          )}
        </div>
      )}
      {(cards.isError && !cards.data) || (me.isError && !me.data) ? (
        <EmptyState
          title={t("m22.page.failed")}
          tone="error"
          action={
            <Button
              className="min-h-11"
              onClick={() => {
                void me.refetch();
                void cards.refetch();
              }}
            >
              {t("common.retry")}
            </Button>
          }
        />
      ) : !online && (!me.data || !cards.data) ? (
        <EmptyState title={t("common.offline")} />
      ) : !me.data || !cards.data ? (
        <div role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : cardId !== null ? (
        <div className="space-y-4">
          <Button className="min-h-11" variant="secondary" onClick={() => changeCard(null)}>
            {t("m22.view.back")}
          </Button>
          {selected ? (
            <ReportCardView
              card={selected}
              learnerName={names.get(selected.learnerId)}
              canPublish={staff && me.data.permissions.includes("m22.reports.publish")}
            />
          ) : (
            <EmptyState title={t("m22.view.unavailable")} />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <ReportCardList
            cards={items.filter((card) => !learnerId || card.learnerId === learnerId)}
            names={names}
            onOpen={changeCard}
          />
        </div>
      )}
      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default ReportCardsPage;
