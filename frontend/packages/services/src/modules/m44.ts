import {
  PAGE_SIZE_MAX,
  QuestionResultSchema,
  SurveySchema,
  ThemeSummarySchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const surveyPage = pageSchema(SurveySchema);
const resultPage = pageSchema(QuestionResultSchema);
const themePage = pageSchema(ThemeSummarySchema);

export function useSurveys() {
  return useScopedQuery(
    (s) => queryKeys.m44.surveys(s),
    (c, signal) => c.get("/surveys", surveyPage, all, { signal }),
  );
}

export function useSurvey(surveyId: string) {
  return useScopedQuery(
    (s) => queryKeys.m44.survey(s, surveyId),
    (c, signal) =>
      c.get(`/surveys/${encodeURIComponent(surveyId)}`, SurveySchema, undefined, { signal }),
  );
}

export function useSurveyResults(surveyId: string) {
  return useScopedQuery(
    (s) => queryKeys.m44.results(s, surveyId),
    (c, signal) =>
      c.get(`/surveys/${encodeURIComponent(surveyId)}/results`, resultPage, all, { signal }),
  );
}

export function useSurveyThemes(surveyId: string) {
  return useScopedQuery(
    (s) => queryKeys.m44.themes(s, surveyId),
    (c, signal) =>
      c.get(`/surveys/${encodeURIComponent(surveyId)}/themes`, themePage, all, { signal }),
  );
}
