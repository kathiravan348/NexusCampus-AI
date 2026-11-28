import {
  DoubtAnswerSchema,
  DoubtSchema,
  PAGE_SIZE_MAX,
  ParentReportSchema,
  TestRankSchema,
  TestSeriesSchema,
  WeakTopicPlanSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const TestSeriesPage = pageSchema(TestSeriesSchema);
const TestRankPage = pageSchema(TestRankSchema);
const DoubtPage = pageSchema(DoubtSchema);
const DoubtAnswerPage = pageSchema(DoubtAnswerSchema);
const WeakTopicPlanPage = pageSchema(WeakTopicPlanSchema);
const ParentReportPage = pageSchema(ParentReportSchema);

export function useTestSeries() {
  return useScopedQuery(
    (s) => queryKeys.m40.testSeries(s),
    (c, signal) => c.get("/test-series", TestSeriesPage, all, { signal }),
  );
}

export function useTestSeriesRanks(seriesId: string | null) {
  const path = `/test-series/${encodeURIComponent(seriesId ?? "")}/ranks`;
  return useScopedQuery(
    (s) => queryKeys.m40.testSeriesRanks(s, seriesId),
    (c, signal) => c.get(path, TestRankPage, all, { signal }),
    seriesId !== null,
  );
}

export function useDoubts(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m40.doubts(s, learnerId),
    (c, signal) => c.get("/doubts", DoubtPage, query, { signal }),
  );
}

export function useDoubtAnswers(doubtId: string | null) {
  const path = `/doubts/${encodeURIComponent(doubtId ?? "")}/answers`;
  return useScopedQuery(
    (s) => queryKeys.m40.doubtAnswers(s, doubtId),
    (c, signal) => c.get(path, DoubtAnswerPage, all, { signal }),
    doubtId !== null,
  );
}

export function useWeakTopicPlans(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m40.weakTopicPlans(s, learnerId),
    (c, signal) => c.get("/weak-topic-plans", WeakTopicPlanPage, query, { signal }),
  );
}

export function useParentReports(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m40.parentReports(s, learnerId),
    (c, signal) => c.get("/parent-reports", ParentReportPage, query, { signal }),
  );
}
