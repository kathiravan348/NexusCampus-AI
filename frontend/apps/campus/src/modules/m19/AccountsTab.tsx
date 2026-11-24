import type { LedgerAccount } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { Badge, EmptyState } from "@nexus/ui-core";

export function AccountsTab({ accounts }: { readonly accounts: readonly LedgerAccount[] }) {
  const t = useText();
  if (!accounts.length) return <EmptyState title={t("m19.accounts.empty")} />;
  const byId = new Set(accounts.map((item) => item.id));
  const children = new Map<string | null, LedgerAccount[]>();
  for (const item of accounts) {
    const parent = item.parentId && byId.has(item.parentId) ? item.parentId : null;
    const items = children.get(parent) ?? [];
    items.push(item);
    children.set(parent, items);
  }
  const renderList = (parent: string | null): React.ReactNode => {
    const nodes = children.get(parent);
    if (!nodes) return null;
    return (
      <ul className={parent === null ? "space-y-2" : "mt-2 space-y-2 ps-3 md:ps-5"}>
        {nodes.sort((a, b) => a.code.localeCompare(b.code)).map((item) => (
          <li key={item.id}>
            <div className="flex flex-col gap-2 rounded-md border border-border-default bg-bg-raised p-3 md:flex-row md:items-center">
              <span className="text-body font-semibold break-words">{item.code} — {item.name}</span>
              <span className="text-body-sm text-text-secondary">{t(`m19.kind.${item.kind}`)}</span>
              {!item.active && <div><Badge tone="neutral">{t("common.inactive")}</Badge></div>}
            </div>
            {renderList(item.id)}
          </li>
        ))}
      </ul>
    );
  };
  return <>{renderList(null)}</>;
}
