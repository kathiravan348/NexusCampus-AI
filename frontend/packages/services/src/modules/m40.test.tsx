import { DOUBT, LEARNER, TENANT, TEST_SERIES, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useDoubtAnswers,
  useDoubts,
  useParentReports,
  useTestSeries,
  useTestSeriesRanks,
  useWeakTopicPlans,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M40 hooks", () => {
  it("loads test series, ranks, doubts, answers, weak-topic plans and parent reports", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.apex, userId: USER.axKarthik });
    const { result } = renderHook(
      () => ({
        series: useTestSeries(),
        ranks: useTestSeriesRanks(TEST_SERIES.axCompleted),
        doubts: useDoubts(),
        doubtsByLearner: useDoubts(LEARNER.axVijay),
        answers: useDoubtAnswers(DOUBT.axAiAnswered),
        plans: useWeakTopicPlans(),
        plansByLearner: useWeakTopicPlans(LEARNER.axArun),
        reports: useParentReports(),
        reportsByLearner: useParentReports(LEARNER.axVijay),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const {
        series,
        ranks,
        doubts,
        doubtsByLearner,
        answers,
        plans,
        plansByLearner,
        reports,
        reportsByLearner,
      } = result.current;
      expect(series.data?.total).toBe(3);
      expect(ranks.data?.total).toBe(2);
      expect(doubts.data?.total).toBe(4);
      expect(doubtsByLearner.data?.items).toHaveLength(2);
      expect(answers.data?.total).toBe(1);
      expect(plans.data?.total).toBe(2);
      expect(plansByLearner.data?.items).toHaveLength(1);
      expect(reports.data?.total).toBe(2);
      expect(reportsByLearner.data?.items).toHaveLength(1);
    });
  });
});
