import {
  GradingSchemeSchema,
  AssessmentSchema,
  RubricSchema,
  MarkEntrySchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const GradingSchemePage = pageSchema(GradingSchemeSchema);
const AssessmentPage = pageSchema(AssessmentSchema);
const RubricPage = pageSchema(RubricSchema);
const MarkEntryPage = pageSchema(MarkEntrySchema);

export function useGradingSchemes() {
  return useScopedQuery(queryKeys.m20.gradingSchemes, (c, signal) =>
    c.get("/grading-schemes", GradingSchemePage, all, { signal }),
  );
}

export function useAssessments(classGroupId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m20.assessments(s, classGroupId),
    (c, signal) => c.get("/assessments", AssessmentPage, { ...all, classGroupId }, { signal }),
  );
}

export function useRubrics() {
  return useScopedQuery(queryKeys.m20.rubrics, (c, signal) =>
    c.get("/rubrics", RubricPage, all, { signal }),
  );
}

export function useAssessmentMarks(assessmentId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m20.assessmentMarks(s, assessmentId),
    (c, signal) =>
      c.get(`/assessments/${encodeURIComponent(assessmentId ?? "")}/marks`, MarkEntryPage, all, {
        signal,
      }),
    assessmentId !== null,
  );
}
