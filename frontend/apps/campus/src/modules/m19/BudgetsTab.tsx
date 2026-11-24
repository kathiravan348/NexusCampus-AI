import type { Budget, LedgerAccount } from "@nexus/contracts";
import { formatMoney, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { Badge, Card, EmptyState } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

interface Props {
  readonly budgets: readonly Budget[];
  readonly accounts: ReadonlyMap<string, LedgerAccount>;
}

export function BudgetsTab({ budgets, accounts }: Props) {
  const t = useText();
  const { locale } = useRuntime();
  const local = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  if (!budgets.length) return <EmptyState title={t("m19.budgets.empty")} />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {budgets.map((budget) => (
        <Card key={budget.id} title={
          <span className="flex flex-wrap items-center gap-2">
            {t("m19.budgets.title")} · {budget.currency}
            <Badge tone="neutral">{t(`m19.status.${budget.status}`)}</Badge>
          </span>
        }>
          <ul className="space-y-2">
            {budget.lines.map((line) => {
              const account = accounts.get(line.accountId);
              return <li key={line.accountId} className="flex flex-col md:flex-row md:justify-between">
                <span>{account ? `${account.code} — ${account.name}` : t("m19.account.unavailable")}</span>
                <span>{formatMoney(line.amount, budget.currency, local)}</span>
              </li>;
            })}
          </ul>
          <p className="mt-3 font-semibold">
            {t("m19.budgets.total")} · {formatMoney(budget.lines.reduce((sum, line) => sum + line.amount, 0), budget.currency, local)}
          </p>
        </Card>
      ))}
    </div>
  );
}
