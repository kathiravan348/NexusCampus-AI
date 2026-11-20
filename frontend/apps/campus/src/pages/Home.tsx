import { useText } from "@nexus/i18n";
import { useMe } from "@nexus/services";
import { Card, EmptyState } from "@nexus/ui-core";
import { LayoutGrid } from "lucide-react";
import { Link } from "react-router";
import { useShellContext } from "../app/Shell";
import { useRuntime } from "../app/TenantRuntime";

/** Welcome page: the persona's name, an intro line and a tile (name + one-line description) per module this user may open. */
export function Home() {
  const t = useText();
  const me = useMe();
  const { visibleModules } = useShellContext();
  const { tenantName } = useRuntime();
  const person = me.data?.person;
  const name = person ? (person.preferredName ?? person.legalName) : "";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {me.isPending ? t("common.loading") : t("common.shell.welcome", { name })}
        </h1>
        <p className="max-w-prose text-body text-text-secondary">
          {t("common.shell.introLine", { institution: tenantName })}
        </p>
      </div>
      {visibleModules.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-6 w-6" />}
          title={t("common.shell.noModulesTitle")}
          description={t("common.shell.noModulesBody")}
        />
      ) : (
        <section aria-label={t("common.shell.modulesHeading")}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleModules.map((m) => {
              const Icon = m.icon;
              return (
                <li key={m.moduleId + m.path}>
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
