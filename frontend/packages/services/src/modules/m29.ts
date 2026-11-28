import {
  CoverageEntrySchema,
  LessonPlanSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  PAGE_SIZE_MAX,
  SyllabusCoverageSchema,
  SyllabusUnitSchema,
  pageSchema,
} from "@nexus/contracts";
import { z } from "zod";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const OutcomeFrameworkPage = pageSchema(OutcomeFrameworkSchema);
const OutcomePage = pageSchema(OutcomeSchema);
const OutcomeMappingPage = pageSchema(OutcomeMappingSchema);
const SyllabusUnitPage = pageSchema(SyllabusUnitSchema);
const LessonPlanPage = pageSchema(LessonPlanSchema);
const CoverageResponse = z.strictObject({
  coverage: SyllabusCoverageSchema,
  entries: z.array(CoverageEntrySchema),
});

export function useOutcomeFrameworks() {
  return useScopedQuery(queryKeys.m29.outcomeFrameworks, (c, signal) =>
    c.get("/outcome-frameworks", OutcomeFrameworkPage, all, { signal }),
  );
}

export function useOutcomes(frameworkId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m29.outcomes(s, frameworkId),
    (c, signal) => c.get("/outcomes", OutcomePage, { ...all, frameworkId }, { signal }),
  );
}

export function useOutcomeMappings(frameworkId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m29.outcomeMappings(s, frameworkId),
    (c, signal) =>
      c.get("/outcome-mappings", OutcomeMappingPage, { ...all, frameworkId }, { signal }),
  );
}

export function useSyllabusUnits(subjectId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m29.syllabusUnits(s, subjectId),
    (c, signal) => c.get("/syllabus-units", SyllabusUnitPage, { ...all, subjectId }, { signal }),
  );
}

export function useLessonPlans(subjectOfferingId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m29.lessonPlans(s, subjectOfferingId),
    (c, signal) =>
      c.get("/lesson-plans", LessonPlanPage, { ...all, subjectOfferingId }, { signal }),
  );
}

export function useSyllabusCoverage(subjectOfferingId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m29.syllabusCoverage(s, subjectOfferingId),
    (c, signal) => c.get("/syllabus-coverage", CoverageResponse, { subjectOfferingId }, { signal }),
    subjectOfferingId !== null,
  );
}
