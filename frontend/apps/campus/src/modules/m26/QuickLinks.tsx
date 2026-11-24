import type { ModuleId } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useId, useMemo } from "react";
import { Link } from "react-router";
import { MODULES } from "../../app/modules";
import { useModuleAccess } from "../../app/RouteGuard";

const QUICK_LINK_MODULES: readonly ModuleId[] = ["M16", "M17", "M22", "M23", "M24"];

const LINK_CLASS =
  "flex min-h-11 w-full items-center gap-2 rounded-md border border-border-strong bg-bg-surface px-3 py-2 text-body-sm font-medium text-text-primary transition-colors hover:bg-bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface";

export interface QuickLinksProps {
  readonly visibleModuleIds?: ReadonlySet<ModuleId>;
}

/** Quick links to learner module pages that are visible in navigation for this user. */
export function QuickLinks({ visibleModuleIds }: QuickLinksProps) {
  const t = useText();
  const headingId = useId();
  const access = useModuleAccess();

  const links = useMemo(
    () =>
      QUICK_LINK_MODULES.flatMap((moduleId) => {
        const entry = MODULES.find((item) => item.moduleId === moduleId);
        if (!entry) return [];
        const visible = visibleModuleIds
          ? visibleModuleIds.has(entry.moduleId)
          : access.isVisible(entry);
        return visible ? [entry] : [];
      }),
    [access, visibleModuleIds],
  );

  if (links.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-border-default bg-bg-surface p-4">
      <h2 id={headingId} className="text-section-title font-semibold text-text-primary">
        {t("m26.links.title")}
      </h2>
      <nav aria-labelledby={headingId}>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((entry) => {
            const Icon = entry.icon;
            return (
              <li key={entry.moduleId}>
                <Link to={`/${entry.path}`} className={LINK_CLASS}>
                  <Icon className="h-4 w-4 shrink-0 text-brand-primary-text" aria-hidden="true" />
                  <span className="min-w-0 break-words">{t(entry.navKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}
