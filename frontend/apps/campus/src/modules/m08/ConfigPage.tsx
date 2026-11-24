import type { ConfigEntity } from "@nexus/contracts";
import { getDirection, useText } from "@nexus/i18n";
import { useAiSettings, useEntitlements, useMe, useCustomFields } from "@nexus/services";
import { Button, EmptyState, Skeleton, Tabs } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { AssistPanel } from "../m11/AssistPanel";
import { FieldsTab } from "./FieldsTab";
import { FormsTab } from "./FormsTab";
import { WorkflowsTab } from "./WorkflowsTab";

export function ConfigPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const entitlements = useEntitlements();
  const [entity, setEntity] = useState<ConfigEntity>("learner");
  const fields = useCustomFields(entity);
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
        title={t("common.error")}
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const permissions = new Set(me.data.permissions);
  const canManage = permissions.has("m08.config.manage");
  const showAssist = online && m11Entitled && canAskAssist && (aiSettings.data?.enabled ?? false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("m08.nav.title")}
          </h1>
          <p className="text-body text-text-secondary">{t("m08.nav.summary")}</p>
          <LastSynced updatedAt={fields.dataUpdatedAt} />
        </div>
        {showAssist && (
          <Button variant="secondary" size="sm" onClick={() => setAssistOpen(true)}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t("m08.config.askAssist")}
          </Button>
        )}
      </header>

      <div className="min-w-0 [&_[role=tablist]]:h-auto [&_[role=tablist]]:max-w-full [&_[role=tablist]]:flex-wrap [&_[role=tab]]:whitespace-normal">
        <Tabs
          ariaLabel={t("m08.nav.title")}
          dir={getDirection(locale)}
          defaultValue="fields"
          items={[
            {
              value: "fields",
              label: t("m08.config.fields"),
              content: (
                <FieldsTab
                  entity={entity}
                  onEntityChange={setEntity}
                  canManage={canManage}
                  online={online}
                />
              ),
            },
            {
              value: "forms",
              label: t("m08.config.forms"),
              content: <FormsTab />,
            },
            {
              value: "workflows",
              label: t("m08.config.workflows"),
              content: <WorkflowsTab />,
            },
          ]}
        />
      </div>

      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default ConfigPage;
