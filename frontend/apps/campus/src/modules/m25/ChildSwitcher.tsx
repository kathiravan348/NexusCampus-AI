import type { ModuleId } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useLearners, usePeople } from "@nexus/services";
import { Select } from "@nexus/ui-core";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { MODULES, type ModuleEntry } from "../../app/modules";
import { useModuleAccess } from "../../app/RouteGuard";

const QUICK_LINK_MODULES: readonly ModuleId[] = ["M17", "M18", "M22", "M23"];

const QUICK_LINK_CLASS =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-bg-surface px-3 py-2 text-body-sm font-medium text-text-primary transition-colors hover:bg-bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface";

function QuickLink({ entry }: { readonly entry: ModuleEntry }) {
  const t = useText();
  const Icon = entry.icon;

  return (
    <li>
      <Link to={`/${entry.path}`} className={QUICK_LINK_CLASS}>
        <Icon className="h-4 w-4 shrink-0 text-brand-primary-text" aria-hidden="true" />
        <span>{t(entry.navKey)}</span>
      </Link>
    </li>
  );
}

export interface ChildSwitcherProps {
  readonly learnerIds: readonly string[];
  readonly visibleModuleIds?: ReadonlySet<ModuleId>;
}

/** Child display or `?child=` switcher plus quick links to visible child module pages. */
export function ChildSwitcher({ learnerIds, visibleModuleIds }: ChildSwitcherProps) {
  const t = useText();
  const [params, setParams] = useSearchParams();
  const learners = useLearners();
  const people = usePeople();
  const access = useModuleAccess();

  const names = useMemo(() => {
    const personNames = new Map<string, string>();
    for (const person of people.data?.items ?? []) {
      personNames.set(person.id, person.preferredName || person.legalName);
    }
    const map = new Map<string, string>();
    for (const learner of learners.data?.items ?? []) {
      const label = personNames.get(learner.personId) ?? learner.learnerNumber;
      if (label) map.set(learner.id, label);
    }
    return map;
  }, [learners.data, people.data]);

  const quickLinks = useMemo(
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

  const firstId = learnerIds[0] ?? "";
  const requested = params.get("child");
  const selectedId = requested && learnerIds.includes(requested) ? requested : firstId;

  const labelOf = (id: string) => names.get(id) ?? t("m25.child.fallback");

  const selectChild = (nextId: string) => {
    const next = new URLSearchParams(params);
    next.set("child", nextId);
    setParams(next);
  };

  if (learnerIds.length === 0 && quickLinks.length === 0) return null;

  return (
    <section
      aria-label={t("m25.child.sectionLabel")}
      className="space-y-4 rounded-lg border border-border-default bg-bg-surface p-4"
    >
      {learnerIds.length === 1 ? (
        <p className="text-section-title font-semibold text-text-primary">{labelOf(firstId)}</p>
      ) : learnerIds.length > 1 ? (
        <Select
          label={t("m25.child.label")}
          className="min-h-11"
          containerClassName="max-w-xs"
          value={selectedId}
          options={learnerIds.map((id) => ({ value: id, label: labelOf(id) }))}
          onChange={(event) => selectChild(event.target.value)}
        />
      ) : null}
      {quickLinks.length > 0 && (
        <nav aria-label={t("m25.child.linksLabel")}>
          <ul className="flex flex-wrap gap-2">
            {quickLinks.map((entry) => (
              <QuickLink key={entry.moduleId} entry={entry} />
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
