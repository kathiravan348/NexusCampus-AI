import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAssessments,
  useClassGroups,
  useMe,
  useRubrics,
  useSaveMarkEntry,
  useSubjectOfferings,
} from "@nexus/services";
import { EmptyState, Select } from "@nexus/ui-core";
import { useSearchParams } from "react-router";
import { LastSynced } from "../../app/LastSynced";
import { Forbidden } from "../../pages/Forbidden";
import { AssessmentList } from "./AssessmentList";
import { MarkSheet } from "./MarkSheet";

export function GradebookPage() {
  const t = useText();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const groups = useClassGroups();
  const offerings = useSubjectOfferings();
  const rubrics = useRubrics();
  const groupParam = params.get("group");
  const assessments = useAssessments(groupParam);
  const selected = assessments.data?.items.find((row) => row.id === params.get("assessment"));
  const selectedGroupId = selected
    ? offerings.data?.items.find((row) => row.id === selected.subjectOfferingId)?.classGroupId
    : undefined;
  const groupId = groupParam ?? selectedGroupId ?? "";
  const writer = useSaveMarkEntry(selected?.id ?? null);

  if (
    [assessments.error, groups.error, me.error, rubrics.error].some(
      (error) => error instanceof ApiRequestError && error.status === 403,
    )
  ) {
    return <Forbidden />;
  }

  const failed =
    (assessments.isError && !assessments.data) ||
    (groups.isError && !groups.data) ||
    (me.isError && !me.data) ||
    (selected?.rubricId != null && rubrics.isError && !rubrics.data);

  const groupOfferingIds = new Set<string>();
  for (const row of offerings.data?.items ?? []) {
    if (row.classGroupId === groupId) groupOfferingIds.add(row.id);
  }
  const visibleAssessments = !assessments.data
    ? []
    : groupParam !== null
      ? assessments.data.items
      : assessments.data.items.filter((row) => groupOfferingIds.has(row.subjectOfferingId));
  const selectedRubric = selected?.rubricId
    ? (rubrics.data?.items.find((row) => row.id === selected.rubricId) ?? null)
    : null;
  const needsRubric = selected?.rubricId != null && !rubrics.data;

  return (
    <div className="min-w-0 space-y-6">
      <header className="space-y-1">
        <h1 className="text-page-title font-semibold text-text-primary">{t("m20.nav.title")}</h1>
        <p className="text-body text-text-secondary">{t("m20.page.intro")}</p>
        <LastSynced updatedAt={assessments.dataUpdatedAt} />
      </header>
      {failed ? (
        <EmptyState tone="error" title={t("common.error")} />
      ) : !groups.data || !assessments.data || !me.data || needsRubric ? (
        <p role="status">{t("common.loading")}</p>
      ) : (
        <>
          <Select
            className="min-h-11"
            label={t("m20.page.classGroup")}
            placeholder={t("common.selectOption")}
            value={groupId}
            options={groups.data.items.map((row) => ({ value: row.id, label: row.name }))}
            onChange={(event) => setParams(event.target.value ? { group: event.target.value } : {})}
          />
          {groupId && (
            <AssessmentList
              assessments={visibleAssessments}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setParams({ group: groupId, assessment: id })}
            />
          )}
          {selected && (
            <MarkSheet
              key={selected.id}
              assessment={selected}
              rubric={selectedRubric}
              canEnter={me.data.permissions.includes("m20.marks.enter")}
              writer={writer}
            />
          )}
        </>
      )}
    </div>
  );
}

export default GradebookPage;
