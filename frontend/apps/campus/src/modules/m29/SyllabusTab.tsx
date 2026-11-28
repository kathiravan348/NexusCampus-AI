import type { CoverageStatus } from "@nexus/contracts";
import {
  formatDate,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import {
  useClassGroups,
  useSubjectOfferings,
  useSubjects,
  useSyllabusCoverage,
  useSyllabusUnits,
} from "@nexus/services";
import { Badge, Button, Card, EmptyState, Meter, Select, Skeleton } from "@nexus/ui-core";
import { BookOpen, CheckCircle2, Circle, Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";

const COVERAGE_META: Readonly<
  Record<
    CoverageStatus,
    {
      readonly key: MessageKey;
      readonly tone: "neutral" | "info" | "success";
      readonly icon: typeof Circle;
    }
  >
> = {
  not_started: { key: "m29.coverage.notStarted", tone: "neutral", icon: Circle },
  in_progress: { key: "m29.coverage.inProgress", tone: "info", icon: Clock },
  covered: { key: "m29.coverage.covered", tone: "success", icon: CheckCircle2 },
};

const COVERAGE_THRESHOLDS = { warning: 2, danger: 2 };

/** Syllabus units and topics in order with text + icon coverage status and percentage meter. */
export function SyllabusTab() {
  const t = useText();
  const { locale } = useRuntime();
  const offerings = useSubjectOfferings();
  const subjects = useSubjects();
  const classGroups = useClassGroups();
  const [selectedOfferingId, setSelectedOfferingId] = useState("");

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const offeringList = useMemo(() => offerings.data?.items ?? [], [offerings.data?.items]);
  const subjectById = useMemo(
    () => new Map((subjects.data?.items ?? []).map((row) => [row.id, row])),
    [subjects.data?.items],
  );
  const groupById = useMemo(
    () => new Map((classGroups.data?.items ?? []).map((row) => [row.id, row])),
    [classGroups.data?.items],
  );

  const activeOffering = useMemo(
    () => offeringList.find((row) => row.id === selectedOfferingId) ?? offeringList[0] ?? null,
    [offeringList, selectedOfferingId],
  );
  const activeOfferingId = activeOffering?.id ?? null;
  const activeGroup = activeOffering ? groupById.get(activeOffering.classGroupId) : undefined;

  const units = useSyllabusUnits(activeOffering?.subjectId ?? null, activeOffering !== null);
  const coverage = useSyllabusCoverage(activeOfferingId);

  const offeringOptions = useMemo(
    () =>
      offeringList.map((row) => {
        const subject = subjectById.get(row.subjectId);
        const group = groupById.get(row.classGroupId);
        const label =
          subject && group ? `${subject.name} — ${group.name}` : (subject?.name ?? row.id);
        return { value: row.id, label };
      }),
    [offeringList, subjectById, groupById],
  );

  const matchedUnits = useMemo(() => {
    const raw = units.data?.items ?? [];
    const filtered = activeGroup?.yearLevelId
      ? raw.filter(
          (unit) => unit.yearLevelId === null || unit.yearLevelId === activeGroup.yearLevelId,
        )
      : raw;
    return [...filtered].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  }, [units.data?.items, activeGroup?.yearLevelId]);

  const coverageByTopic = useMemo(
    () => new Map((coverage.data?.entries ?? []).map((entry) => [entry.topicId, entry])),
    [coverage.data?.entries],
  );

  const loadingBase =
    (offerings.isPending && !offerings.data) ||
    (subjects.isPending && !subjects.data) ||
    (classGroups.isPending && !classGroups.data);
  const failedBase =
    (offerings.isError && !offerings.data) ||
    (subjects.isError && !subjects.data) ||
    (classGroups.isError && !classGroups.data);

  if (loadingBase) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (failedBase) {
    return (
      <EmptyState
        tone="error"
        title={t("m29.syllabus.error")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void offerings.refetch();
              void subjects.refetch();
              void classGroups.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  if (!activeOffering) {
    return (
      <EmptyState
        icon={<BookOpen className="h-6 w-6" />}
        title={t("m29.syllabus.noOfferings")}
        description={t("m29.syllabus.noOfferingsBody")}
      />
    );
  }

  const syllabusLoading =
    (units.isPending && !units.data) || (coverage.isPending && !coverage.data);
  const syllabusFailed = (units.isError && !units.data) || (coverage.isError && !coverage.data);
  const cov = coverage.data?.coverage;
  const percentText = cov
    ? formatNumber(cov.percentBps / 100, safeLocale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    : formatNumber(0, safeLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <div className="space-y-4">
      <Select
        label={t("m29.syllabus.offering")}
        options={offeringOptions}
        value={activeOffering.id}
        onChange={(e) => setSelectedOfferingId(e.target.value)}
        containerClassName="w-full sm:w-80"
      />

      {syllabusLoading ? (
        <div className="space-y-4" role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : syllabusFailed ? (
        <EmptyState
          tone="error"
          title={t("m29.syllabus.error")}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void units.refetch();
                void coverage.refetch();
              }}
            >
              {t("common.retry")}
            </Button>
          }
        />
      ) : (
        <>
          {cov && (
            <Card>
              <Meter
                label={t("m29.syllabus.coverageLabel")}
                value={cov.percentBps}
                max={10000}
                thresholds={COVERAGE_THRESHOLDS}
                valueText={t("m29.syllabus.coverageValue", {
                  percent: percentText,
                  covered: formatNumber(cov.topicsCovered, safeLocale),
                  total: formatNumber(cov.topicsTotal, safeLocale),
                })}
              />
            </Card>
          )}

          {matchedUnits.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title={t("m29.syllabus.empty")}
              description={t("m29.syllabus.emptyBody")}
            />
          ) : (
            <div className="space-y-4">
              {matchedUnits.map((unit) => {
                const sortedTopics = [...unit.topics].sort((a, b) => a.order - b.order);
                return (
                  <Card
                    key={unit.id}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-words">{unit.title}</span>
                        <Badge tone="neutral">{unit.code}</Badge>
                        {unit.plannedHours !== null && (
                          <Badge tone="info">
                            {t("m29.syllabus.plannedHours", {
                              hours: formatNumber(unit.plannedHours, safeLocale),
                            })}
                          </Badge>
                        )}
                      </span>
                    }
                  >
                    <ol className="space-y-2.5">
                      {sortedTopics.map((topic) => {
                        const entry = coverageByTopic.get(topic.id);
                        const status: CoverageStatus = entry?.status ?? "not_started";
                        const meta = COVERAGE_META[status];
                        const StatusIcon = meta.icon;
                        return (
                          <li
                            key={topic.id}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border-default bg-bg-raised p-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <p className="break-words text-body font-medium text-text-primary">
                                {topic.title}
                              </p>
                              {entry?.coveredOn && (
                                <p className="text-body-sm text-text-secondary">
                                  {t("m29.syllabus.coveredOn", {
                                    date: formatDate(entry.coveredOn, { locale: safeLocale }),
                                  })}
                                </p>
                              )}
                            </div>
                            <Badge tone={meta.tone}>
                              <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span>{t(meta.key)}</span>
                            </Badge>
                          </li>
                        );
                      })}
                    </ol>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
