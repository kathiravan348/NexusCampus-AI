import { useControlText } from "@nexus/i18n/control";
import { useCompatibility, useExtensions } from "@nexus/services/control";
import { Badge, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { RESULT } from "./labels";

/** P08 Customisation & extensions: customer work as signed packages, checked against releases (D20). */
export default function ExtensionsPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const extensions = useExtensions();
  const checks = useCompatibility();
  const accounts = useAccountNames();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p08.nav")}
        </h1>
        <p className="max-w-prose text-body text-text-secondary">{t("p08.intro")}</p>
      </div>
      {extensions.isPending ? (
        <Skeleton className="h-48" />
      ) : extensions.isError ? (
        <EmptyState tone="error" />
      ) : extensions.data.items.length === 0 ? (
        <EmptyState description={t("p08.empty")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {extensions.data.items.map((ext) => {
            const mine = (checks.data?.items ?? []).filter((c) => c.extensionId === ext.id);
            return (
              <li key={ext.id}>
                <Card
                  headingAs="h2"
                  title={ext.name}
                  actions={
                    <Badge tone={ext.signed ? "success" : "warning"}>
                      {t(ext.signed ? "p08.signed" : "p08.unsigned")}
                    </Badge>
                  }
                >
                  <div className="space-y-3">
                    <p className="text-body-sm text-text-secondary">
                      {accounts.get(ext.accountId) ?? ext.accountId}
                      {" · "}
                      <span className="font-mono">
                        {t("p08.package", { code: ext.code, version: ext.version })}
                      </span>
                      {" · "}
                      {t("p08.built", { date: fmt.date(ext.builtAt) })}
                    </p>
                    <section className="space-y-2" aria-label={t("p08.checks")}>
                      <h3 className="text-body font-medium text-text-primary">{t("p08.checks")}</h3>
                      {mine.length === 0 ? (
                        <p className="text-body-sm text-text-secondary">{t("p08.noChecks")}</p>
                      ) : (
                        <ul className="space-y-2">
                          {mine.map((c) => {
                            const r = RESULT[c.result];
                            return (
                              <li
                                key={c.releaseVersion}
                                className="space-y-1 rounded-md border border-border-default p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-text-primary">
                                    {t("p08.checkRelease", { version: c.releaseVersion })}
                                  </span>
                                  <Badge tone={r.tone}>{t(r.key)}</Badge>
                                  <span className="text-body-sm text-text-secondary">
                                    {t("p08.checkedAt", { date: fmt.date(c.checkedAt) })}
                                  </span>
                                </div>
                                {c.notes && (
                                  <p className="text-body-sm text-text-primary">{c.notes}</p>
                                )}
                                {c.aiDrafted && (
                                  <p className="flex items-center gap-1 text-body-sm text-info-text">
                                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                                    {t("p08.aiDrafted")}
                                  </p>
                                )}
                              </li>
                            );
                          })}
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
