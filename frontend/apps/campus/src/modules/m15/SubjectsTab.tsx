import type { SubjectKind } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import {
  useCalendars,
  useClassGroups,
  useSubjectOfferings,
  useSubjects,
  useTenant,
} from "@nexus/services";
import { Badge, Button, Card, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";

const SUBJECT_KIND_KEY: Readonly<Record<SubjectKind, MessageKey>> = {
  core: "m15.subjectKind.core",
  elective: "m15.subjectKind.elective",
  language: "m15.subjectKind.language",
  activity: "m15.subjectKind.activity",
  lab: "m15.subjectKind.lab",
  project: "m15.subjectKind.project",
};

/** Subjects catalogue and academic-year filtered subject offerings (M15, L1). */
export function SubjectsTab() {
  const t = useText();
  const { locale } = useRuntime();
  const tenant = useTenant();
  const institutionId = tenant.data?.institutions[0]?.id ?? null;
  const calendars = useCalendars(institutionId);
  const subjects = useSubjects();
  const classGroups = useClassGroups();
  const [selectedYearId, setSelectedYearId] = useState("");
  const offerings = useSubjectOfferings(selectedYearId === "" ? null : selectedYearId);

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const subjectList = subjects.data?.items ?? [];
  const offeringList = offerings.data?.items ?? [];

  const subjectById = useMemo(
    () => new Map((subjects.data?.items ?? []).map((subject) => [subject.id, subject])),
    [subjects.data?.items],
  );
  const classGroupById = useMemo(
    () => new Map((classGroups.data?.items ?? []).map((group) => [group.id, group])),
    [classGroups.data?.items],
  );
  const calendarById = useMemo(
    () => new Map((calendars.data?.items ?? []).map((cal) => [cal.id, cal])),
    [calendars.data?.items],
  );
  const yearOptions = useMemo(
    () => [
      { value: "", label: t("m15.subjects.allYears") },
      ...(calendars.data?.items ?? []).map((cal) => ({ value: cal.id, label: cal.academicYear })),
    ],
    [calendars.data?.items, t],
  );

  if (subjects.isPending && !subjects.data) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (subjects.isError && !subjects.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m15.structure.error")}
        action={
          <Button variant="secondary" onClick={() => void subjects.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card title={t("m15.subjects.listTitle")}>
        {subjectList.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-6 w-6" />} title={t("m15.subjects.empty")} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subjectList.map((subject) => (
              <li
                key={subject.id}
                className="min-w-0 space-y-1.5 rounded-md border border-border-default bg-bg-raised p-3"
              >
                <p className="break-words text-body font-medium text-text-primary">
                  {subject.name}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{subject.code}</Badge>
                  <Badge tone="info">{t(SUBJECT_KIND_KEY[subject.kind])}</Badge>
                  {!subject.active && <Badge tone="warning">{t("common.inactive")}</Badge>}
                </div>
                {subject.credits !== null && (
                  <p className="font-mono text-number-sm text-text-secondary tabular-nums">
                    {t("m15.subjects.credits", {
                      credits: formatNumber(subject.credits, safeLocale),
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("m15.subjects.offeringsTitle")}>
        <div className="space-y-4">
          <Select
            label={t("m15.subjects.academicYear")}
            options={yearOptions}
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            containerClassName="w-full sm:w-56"
          />

          {offerings.isPending && !offerings.data ? (
            <Skeleton className="h-24 w-full" />
          ) : offerings.isError && !offerings.data ? (
            <EmptyState
              tone="error"
              title={t("m15.subjects.offeringsError")}
              action={
                <Button variant="secondary" onClick={() => void offerings.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : offeringList.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title={t("m15.subjects.offeringsEmpty")}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {offeringList.map((offering) => {
                const subject = subjectById.get(offering.subjectId);
                const group = classGroupById.get(offering.classGroupId);
                const calendar = calendarById.get(offering.academicYearId);
                return (
                  <li
                    key={offering.id}
                    className="min-w-0 space-y-1.5 rounded-md border border-border-default bg-bg-raised p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-body font-medium text-text-primary">
                        {subject?.name ?? offering.subjectId}
                      </span>
                      {subject && <Badge tone="neutral">{subject.code}</Badge>}
                    </div>
                    <p className="break-words text-body-sm text-text-secondary">
                      {group ? `${group.name} (${group.code})` : offering.classGroupId}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-muted">
                      {calendar && <Badge tone="brand">{calendar.academicYear}</Badge>}
                      {offering.weeklyPeriods !== null && (
                        <span>
                          {t("m15.subjects.weeklyPeriods", { count: offering.weeklyPeriods })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
