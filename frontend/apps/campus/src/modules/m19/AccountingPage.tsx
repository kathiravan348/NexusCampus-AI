import { getDirection, useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAiSettings,
  useBudgets,
  useEntitlements,
  useJournalEntries,
  useLedgerAccounts,
  useMe,
} from "@nexus/services";
import { Button, EmptyState, Skeleton, Tabs } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { AssistPanel } from "../m11/AssistPanel";
import { AccountsTab } from "./AccountsTab";
import { BudgetsTab } from "./BudgetsTab";
import { JournalTab } from "./JournalTab";

export function AccountingPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const me = useMe();
  const entitlements = useEntitlements();
  const accounts = useLedgerAccounts();
  const journal = useJournalEntries();
  const budgets = useBudgets();
  const [assistOpen, setAssistOpen] = useState(false);
  const assistEnabled = online &&
    !!me.data?.permissions.includes("m11.assist.use") &&
    !!entitlements.data?.items.some((x) => x.moduleId === "M11" && x.enabled);
  const aiSettings = useAiSettings(assistEnabled);
  const showAssist = assistEnabled && aiSettings.data?.enabled;
  const queries = [me, journal, accounts, budgets];
  const denied = queries.some(({ error }) => error instanceof ApiRequestError &&
    (error.error.code === "forbidden" || error.error.code === "module_disabled"));
  if (denied || (me.data && !me.data.permissions.includes("m19.accounts.read"))) {
    return <EmptyState title={t("common.shell.forbiddenTitle")} description={t("common.shell.forbiddenBody")} />;
  }
  const failed = queries.filter((q) => q.isError && !q.data);
  if (failed.length) {
    return <EmptyState tone="error" title={t("m19.page.error")} action={
      <Button variant="secondary" onClick={() => { failed.forEach((q) => void q.refetch()); }}>
        {t("common.retry")}
      </Button>
    } />;
  }
  if (!accounts.data || !journal.data || !budgets.data || !me.data) {
    return <div aria-label={t("common.loading")} role="status"><Skeleton className="h-32 w-full" /></div>;
  }
  const accountMap = new Map(accounts.data.items.map((a) => [a.id, a]));
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("m19.nav.title")}</h1>
          <p className="text-body text-text-secondary">{t("m19.page.intro")}</p>
          <LastSynced updatedAt={journal.dataUpdatedAt} />
        </div>
        {showAssist && <Button variant="secondary" onClick={() => setAssistOpen(true)}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />{t("m19.page.askAssist")}
        </Button>}
      </header>
      <Tabs dir={getDirection(locale)} defaultValue="accounts" ariaLabel={t("m19.nav.title")} items={[
        {
          value: "accounts", label: t("m19.page.accounts"),
          content: <AccountsTab accounts={accounts.data.items} />,
        },
        {
          value: "journal", label: t("m19.page.journal"),
          content: <JournalTab accounts={accountMap} entries={journal.data.items}
            canManage={me.data.permissions.includes("m19.accounts.manage")} online={online} />,
        },
        {
          value: "budgets", label: t("m19.page.budgets"),
          content: <BudgetsTab accounts={accountMap} budgets={budgets.data.items} />,
        },
      ]} />
      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default AccountingPage;
