import { useControlText } from "@nexus/i18n/control";
import { useBreakGlassCases, useStaffDirectory } from "@nexus/services/control";
import { Badge, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";

/** Emergency access: two approvers, the institution told at once, a report afterwards (V-5). */
export function BreakGlassTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const cases = useBreakGlassCases();
  const staff = useStaffDirectory();
  const accounts = useAccountNames();
  const name = (id: string) => staff.get(id) ?? id;

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-body-sm text-text-secondary">{t("p10.bg.note")}</p>
      {cases.isPending ? (
        <Skeleton className="h-32" />
      ) : cases.isError ? (
        <EmptyState tone="error" />
      ) : cases.data.items.length === 0 ? (
        <EmptyState description={t("p10.bg.empty")} />
      ) : (
        <ul className="space-y-3">
          {cases.data.items.map((c) => (
            <li key={c.id}>
              <Card
                headingAs="h3"
                title={accounts.get(c.accountId) ?? c.accountId}
                actions={
                  <Badge tone="danger">
                    {t(
                      c.category === "legal_order"
                        ? "p10.bg.legalOrder"
                        : "p10.bg.securityIncident",
                    )}
                  </Badge>
                }
              >
                <div className="space-y-1 text-body-sm">
                  <p className="text-text-primary">{c.justification}</p>
                  <p className="text-text-secondary">
                    {t("p10.bg.approvers", {
                      first: name(c.approverStaffIds[0]),
                      second: name(c.approverStaffIds[1]),
                    })}
                  </p>
                  <p className="text-text-secondary">
                    {t("p10.bg.notified", { date: fmt.date(c.institutionNotifiedAt) })}
                  </p>
                  {c.reportDeliveredAt ? (
                    <p className="text-success-text">
                      {t("p10.bg.reportDelivered", { date: fmt.date(c.reportDeliveredAt) })}
                    </p>
                  ) : (
                    <Badge tone="warning">{t("p10.bg.reportOwed")}</Badge>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
