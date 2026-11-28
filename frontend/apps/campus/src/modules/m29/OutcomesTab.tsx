import type { Outcome, OutcomeFrameworkKind, OutcomeMapping } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { useOutcomeFrameworks, useOutcomeMappings, useOutcomes } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { Target } from "lucide-react";
import { useMemo, useState } from "react";

const FRAMEWORK_KIND_KEY: Readonly<Record<OutcomeFrameworkKind, MessageKey>> = {
  standards: "m29.frameworkKind.standards",
  course_outcomes: "m29.frameworkKind.courseOutcomes",
  program_outcomes: "m29.frameworkKind.programOutcomes",
  milestones: "m29.frameworkKind.milestones",
  skills: "m29.frameworkKind.skills",
};

const STRENGTH_KEY: Readonly<Record<OutcomeMapping["strength"], MessageKey>> = {
  1: "m29.mappingStrength.low",
  2: "m29.mappingStrength.medium",
  3: "m29.mappingStrength.high",
};

const STRENGTH_TONE = {
  1: "neutral",
  2: "info",
  3: "success",
} as const;

/** Outcome frameworks selector, nested outcome tree (`parentId`), and CO–PO mappings per outcome. */
export function OutcomesTab() {
  const t = useText();
  const frameworks = useOutcomeFrameworks();
  const outcomes = useOutcomes();
  const [selectedId, setSelectedId] = useState("");

  const frameworkList = useMemo(() => frameworks.data?.items ?? [], [frameworks.data?.items]);
  const activeFramework = useMemo(
    () => frameworkList.find((fw) => fw.id === selectedId) ?? frameworkList[0] ?? null,
    [frameworkList, selectedId],
  );
  const activeFrameworkId = activeFramework?.id ?? null;
  const mappings = useOutcomeMappings(activeFrameworkId);

  const allOutcomes = useMemo(() => outcomes.data?.items ?? [], [outcomes.data?.items]);
  const outcomeById = useMemo(
    () => new Map(allOutcomes.map((row) => [row.id, row])),
    [allOutcomes],
  );
  const frameworkOptions = useMemo(
    () => frameworkList.map((fw) => ({ value: fw.id, label: `${fw.name} (${fw.code})` })),
    [frameworkList],
  );

  const childrenByParent = useMemo(() => {
    const inFramework = allOutcomes.filter((row) => row.frameworkId === activeFrameworkId);
    const localIds = new Set(inFramework.map((row) => row.id));
    const map = new Map<string | null, Outcome[]>();
    for (const outcome of inFramework) {
      const key = outcome.parentId && localIds.has(outcome.parentId) ? outcome.parentId : null;
      const bucket = map.get(key) ?? [];
      bucket.push(outcome);
      map.set(key, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
    }
    return map;
  }, [allOutcomes, activeFrameworkId]);

  const mappingsByOutcome = useMemo(() => {
    const map = new Map<string, OutcomeMapping[]>();
    for (const row of mappings.data?.items ?? []) {
      for (const id of [row.fromOutcomeId, row.toOutcomeId]) {
        const bucket = map.get(id) ?? [];
        bucket.push(row);
        map.set(id, bucket);
      }
    }
    return map;
  }, [mappings.data?.items]);

  const loading =
    (frameworks.isPending && !frameworks.data) || (outcomes.isPending && !outcomes.data);
  const failed = (frameworks.isError && !frameworks.data) || (outcomes.isError && !outcomes.data);

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (failed) {
    return (
      <EmptyState
        tone="error"
        title={t("m29.outcomes.error")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void frameworks.refetch();
              void outcomes.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  if (!activeFramework) {
    return (
      <EmptyState
        icon={<Target className="h-6 w-6" />}
        title={t("m29.outcomes.empty")}
        description={t("m29.outcomes.emptyBody")}
      />
    );
  }

  const roots = childrenByParent.get(null) ?? [];

  const renderBranch = (nodes: readonly Outcome[], depth: number, visited: ReadonlySet<string>) => (
    <ul
      className={
        depth === 0 ? "space-y-3" : "mt-3 space-y-3 border-s-2 border-border-default ps-4 ms-2"
      }
    >
      {nodes.map((outcome) => {
        if (visited.has(outcome.id)) return null;
        const nextVisited = new Set(visited);
        nextVisited.add(outcome.id);
        const children = childrenByParent.get(outcome.id) ?? [];
        const related = mappingsByOutcome.get(outcome.id) ?? [];

        return (
          <li
            key={outcome.id}
            className="min-w-0 rounded-md border border-border-default bg-bg-raised p-3"
          >
            <div className="flex flex-wrap items-start gap-2">
              <Badge tone="neutral">{outcome.code}</Badge>
              <p className="min-w-0 flex-1 break-words text-body text-text-primary">
                {outcome.statement}
              </p>
            </div>
            {related.length > 0 && (
              <ul
                aria-label={t("m29.outcomes.mappingsLabel")}
                className="mt-2.5 flex flex-wrap gap-2"
              >
                {related.map((mapping) => {
                  const fromCode = outcomeById.get(mapping.fromOutcomeId)?.code ?? "";
                  const toCode = outcomeById.get(mapping.toOutcomeId)?.code ?? "";
                  return (
                    <li
                      key={mapping.id}
                      className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-border-default bg-bg-surface px-2.5 py-1 text-body-sm"
                    >
                      <span className="font-mono text-number-sm text-text-primary">
                        {t("m29.outcomes.mappingPair", { from: fromCode, to: toCode })}
                      </span>
                      <Badge tone={STRENGTH_TONE[mapping.strength]}>
                        {t(STRENGTH_KEY[mapping.strength])}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            {children.length > 0 && renderBranch(children, depth + 1, nextVisited)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-4">
      <Select
        label={t("m29.outcomes.framework")}
        options={frameworkOptions}
        value={activeFramework.id}
        onChange={(e) => setSelectedId(e.target.value)}
        containerClassName="w-full sm:w-72"
      />

      {mappings.isError && !mappings.data && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm text-danger-text"
        >
          <span>{t("m29.outcomes.mappingsError")}</span>
          <Button variant="secondary" size="sm" onClick={() => void mappings.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-words">{activeFramework.name}</span>
            <Badge tone="brand">{t(FRAMEWORK_KIND_KEY[activeFramework.kind])}</Badge>
            <Badge tone="neutral">{activeFramework.code}</Badge>
            <Badge tone="info">
              {t("m29.outcomes.version", { version: activeFramework.version })}
            </Badge>
            {activeFramework.source === "case_import" && (
              <Badge tone="neutral">{t("m29.outcomes.caseImport")}</Badge>
            )}
          </span>
        }
      >
        {roots.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t("m29.outcomes.noOutcomes")}</p>
        ) : (
          renderBranch(roots, 0, new Set())
        )}
      </Card>
    </div>
  );
}
