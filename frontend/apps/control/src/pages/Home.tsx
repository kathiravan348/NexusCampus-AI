import { useControlText } from "@nexus/i18n/control";
import { useStaffSession } from "@nexus/services/control";
import { Card, EmptyState } from "@nexus/ui-core";
import { LayoutGrid } from "lucide-react";
import { Link } from "react-router";
import { useControlShell } from "../app/Shell";

/** Welcome, what Control is (and never holds), and one tile per page this staff member may open. */
export function Home() {
  const t = useControlText();
  const session = useStaffSession();
  const { visibleModules } = useControlShell();
  const name = session.data?.staff.displayName ?? "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("common.shell.welcome", { name })}
        </h1>
        <p className="max-w-prose text-body text-text-secondary">{t("ctl.home.intro")}</p>
      </div>
      {visibleModules.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-6 w-6" />}
          title={t("common.shell.noModulesTitle")}
          description={t("ctl.home.noModulesBody")}
        />
      ) : (
        <section aria-label={t("common.shell.modulesHeading")}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleModules.map((m) => {
              const Icon = m.icon;
              return (
                <li key={m.path}>
                  <Link
                    to={`/${m.path}`}
                    className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  >
                    <Card className="h-full transition-colors hover:bg-bg-raised">
                      <div className="flex items-start gap-3">
                        <Icon
                          className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary-text"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 space-y-1">
                          <span className="block text-body font-medium text-text-primary">
                            {t(m.navKey)}
                          </span>
                          <span className="block text-body-sm text-text-secondary">
                            {t(m.summaryKey)}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
