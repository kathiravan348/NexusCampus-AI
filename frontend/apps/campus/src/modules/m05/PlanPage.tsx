import {
  formatNumber,
  getDirection,
  isKnownMessageKey,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
} from "@nexus/i18n";
import { useMe, usePlan } from "@nexus/services";
import { Button, Card, EmptyState, Skeleton, Tabs } from "@nexus/ui-core";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { ModulesTab } from "./ModulesTab";
import { UsageTab } from "./UsageTab";

/** Plans & usage (M05, L0): current plan, module switches and usage meters. */
export function PlanPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const plan = usePlan();

  if (plan.isPending || me.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (plan.isError || me.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m05.plan.error")}
        action={
          <Button variant="secondary" onClick={() => void plan.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const p = plan.data;
  const fmt = (n: number) => formatNumber(n, isPseudoLocale(locale) ? SOURCE_LOCALE : locale);
  const canManage = me.data.permissions.includes("m05.module.manage");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m05.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m05.plan.intro")}</p>
      </header>

      <Card title={t("m05.plan.current")}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-label uppercase text-text-muted">{t("m05.plan.name")}</dt>
            <dd className="text-card-title font-semibold text-text-primary">
              {isKnownMessageKey(p.nameKey) ? t(p.nameKey) : p.code}
            </dd>
          </div>
          <div>
            <dt className="text-label uppercase text-text-muted">{t("m05.plan.aiCredits")}</dt>
            <dd className="font-mono text-number-lg tabular-nums">{fmt(p.aiCreditsPerMonth)}</dd>
          </div>
          <div>
            <dt className="text-label uppercase text-text-muted">{t("m05.plan.learnerLimit")}</dt>
            <dd className="font-mono text-number-lg tabular-nums">
              {p.learnerLimit === null ? t("common.unlimited") : fmt(p.learnerLimit)}
            </dd>
          </div>
        </dl>
      </Card>

      <Tabs
        ariaLabel={t("m05.plan.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="modules"
        items={[
          {
            value: "modules",
            label: t("m05.plan.tabModules"),
            content: <ModulesTab canManage={canManage} online={online} />,
          },
          { value: "usage", label: t("m05.plan.tabUsage"), content: <UsageTab /> },
        ]}
      />
    </div>
  );
}

export default PlanPage;
