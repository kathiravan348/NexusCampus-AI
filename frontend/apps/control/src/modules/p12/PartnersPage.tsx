import type { DealRegistration } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import {
  useAccounts,
  useCommissions,
  useDeals,
  usePartners,
  useStaffCan,
} from "@nexus/services/control";
import { Badge, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { useControlFormat } from "../../app/format";
import { COMMISSION_STATUS, DEAL_STATUS, TIER_KEY } from "./labels";

function DealList({
  deals,
  names,
}: {
  readonly deals: readonly DealRegistration[];
  readonly names: ReadonlyMap<string, string>;
}) {
  const t = useControlText();
  const fmt = useControlFormat();
  if (deals.length === 0)
    return <p className="text-body-sm text-text-secondary">{t("p12.noDeals")}</p>;
  return (
    <ul className="space-y-1">
      {deals.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-2 text-body-sm">
          <span>
            {t("p12.deal", {
              account: names.get(d.accountId) ?? d.accountId,
              date: fmt.date(d.expiresAt),
            })}
          </span>
          <Badge tone={DEAL_STATUS[d.status].tone}>{t(DEAL_STATUS[d.status].key)}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** P12 Partners & resellers (read-only). Partner users see their own deal registrations only. */
export default function PartnersPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const can = useStaffCan();
  const seesPartners = can("ctl.partner.read");
  const partners = usePartners(seesPartners);
  const commissions = useCommissions(seesPartners);
  const deals = useDeals();
  const accounts = useAccounts();
  const items = accounts.data?.items ?? [];
  const names = new Map(items.map((a) => [a.id, a.name]));
  const allDeals = deals.data?.items ?? [];

  if (!seesPartners) {
    return (
      <div className="space-y-4">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p12.nav")}
        </h1>
        <Card headingAs="h2" title={t("p12.ownDeals")}>
          {deals.isPending ? (
            <Skeleton className="h-16" />
          ) : (
            <DealList deals={allDeals} names={names} />
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p12.nav")}</h1>
      {partners.isPending ? (
        <Skeleton className="h-48" />
      ) : partners.isError ? (
        <EmptyState tone="error" />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {partners.data.items.map((p) => {
            const customers = items.filter((a) => a.partnerId === p.id);
            const own = (commissions.data?.items ?? []).filter((c) => c.partnerId === p.id);
            return (
              <li key={p.id}>
                <Card
                  headingAs="h2"
                  title={p.name}
                  actions={
                    <span className="flex gap-2">
                      <Badge tone="brand">{t(TIER_KEY[p.tier])}</Badge>
                      {!p.active && <Badge tone="neutral">{t("p12.inactive")}</Badge>}
                    </span>
                  }
                >
                  <div className="space-y-3">
                    <p className="text-body-sm text-text-secondary">
                      {t("p12.meta", {
                        country: fmt.country(p.country),
                        rate: fmt.number(p.commissionPct),
                        date: fmt.date(p.joinedAt),
                      })}
                    </p>
                    <section className="space-y-1">
                      <h3 className="text-body font-medium text-text-primary">
                        {t("p12.customers")}
                      </h3>
                      {customers.length === 0 ? (
                        <p className="text-body-sm text-text-secondary">{t("p12.noCustomers")}</p>
                      ) : (
                        <p className="text-body-sm">{customers.map((a) => a.name).join(", ")}</p>
                      )}
                    </section>
                    <section className="space-y-1">
                      <h3 className="text-body font-medium text-text-primary">{t("p12.deals")}</h3>
                      <DealList
                        deals={allDeals.filter((d) => d.partnerId === p.id)}
                        names={names}
                      />
                    </section>
                    <section className="space-y-1">
                      <h3 className="text-body font-medium text-text-primary">
                        {t("p12.commissions")}
                      </h3>
                      {own.length === 0 ? (
                        <p className="text-body-sm text-text-secondary">{t("p12.noCommissions")}</p>
                      ) : (
                        <ul className="space-y-1">
                          {own.map((c) => (
                            <li
                              key={c.id}
                              className="flex flex-wrap items-center gap-2 text-body-sm"
                            >
                              <span className="tabular-nums">
                                {t("p12.commission", {
                                  amount: fmt.money(c.amountMinor, c.currency),
                                  invoice: c.invoiceId,
                                })}
                              </span>
                              <Badge tone={COMMISSION_STATUS[c.status].tone}>
                                {t(COMMISSION_STATUS[c.status].key)}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
