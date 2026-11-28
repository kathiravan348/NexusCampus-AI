import {
  DoubtAnswerSchema,
  DoubtSchema,
  ParentReportSchema,
  TestRankSchema,
  TestSeriesSchema,
  WeakTopicPlanSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { DOUBT, LEARNER, TENANT, TEST_SERIES, USER } from "../fixtures";
import { server } from "../node";
import type { Parser } from "./route";

const ax = TENANT.apex;

function get(path: string, userId: string = USER.axKarthik, tenantId: string = ax) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  expect(response.status).toBe(200);
  return schema.parse(await response.json());
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M40 read handlers", () => {
  it("serves all M40 endpoints and filters to staff", async () => {
    const series = await parse(await get("/test-series"), pageSchema(TestSeriesSchema));
    expect(series.items).toEqual(mockDb.testSeries.filter((row) => row.tenantId === ax));

    const ranks = await parse(
      await get(`/test-series/${TEST_SERIES.axCompleted}/ranks`),
      pageSchema(TestRankSchema),
    );
    expect(ranks.items).toEqual(
      mockDb.testRanks.filter(
        (row) => row.tenantId === ax && row.seriesId === TEST_SERIES.axCompleted,
      ),
    );

    const doubts = await parse(await get("/doubts"), pageSchema(DoubtSchema));
    expect(doubts.items).toEqual(mockDb.doubts.filter((row) => row.tenantId === ax));

    const vijayDoubts = await parse(
      await get(`/doubts?learnerId=${LEARNER.axVijay}`),
      pageSchema(DoubtSchema),
    );
    expect(vijayDoubts.items).toEqual(
      mockDb.doubts.filter((row) => row.tenantId === ax && row.learnerId === LEARNER.axVijay),
    );

    const answers = await parse(
      await get(`/doubts/${DOUBT.axAiAnswered}/answers`),
      pageSchema(DoubtAnswerSchema),
    );
    expect(answers.items).toEqual(
      mockDb.doubtAnswers.filter(
        (row) => row.tenantId === ax && row.doubtId === DOUBT.axAiAnswered,
      ),
    );

    const plans = await parse(
      await get(`/weak-topic-plans?learnerId=${LEARNER.axArun}`),
      pageSchema(WeakTopicPlanSchema),
    );
    expect(plans.items).toEqual(
      mockDb.weakTopicPlans.filter(
        (row) => row.tenantId === ax && row.learnerId === LEARNER.axArun,
      ),
    );

    const reports = await parse(
      await get(`/parent-reports?learnerId=${LEARNER.axVijay}`),
      pageSchema(ParentReportSchema),
    );
    expect(reports.items).toEqual(
      mockDb.parentReports.filter(
        (row) => row.tenantId === ax && row.learnerId === LEARNER.axVijay,
      ),
    );

    // Teachers also have m40.series.read.
    expect((await get("/test-series", USER.axMeena)).status).toBe(200);
  });

  it("denies learners and guardians on every M40 endpoint", async () => {
    const routes = [
      "/test-series",
      `/test-series/${TEST_SERIES.axCompleted}/ranks`,
      "/doubts",
      `/doubts/${DOUBT.axAiAnswered}/answers`,
      "/weak-topic-plans",
      "/parent-reports",
    ];
    for (const userId of [USER.axArun, USER.axLakshmi]) {
      for (const route of routes) {
        const res = await get(route, userId);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
      }
    }
  });

  it("returns 404 for another tenant's IDs", async () => {
    const otherSeries = {
      ...mockDb.testSeries[0]!,
      id: "tse-rv-other",
      tenantId: TENANT.riverside,
    };
    const otherDoubt = { ...mockDb.doubts[0]!, id: "dbt-rv-other", tenantId: TENANT.riverside };
    mockDb.testSeries.push(otherSeries);
    mockDb.doubts.push(otherDoubt);

    for (const route of [
      `/test-series/${otherSeries.id}/ranks`,
      `/doubts/${otherDoubt.id}/answers`,
      `/doubts?learnerId=${LEARNER.rvMia}`,
      `/weak-topic-plans?learnerId=${LEARNER.rvMia}`,
      `/parent-reports?learnerId=${LEARNER.rvMia}`,
    ]) {
      expect((await get(route)).status).toBe(404);
    }
  });

  it("requires M40 permission and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.axKarthik);
    const forbidden = await get("/test-series");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    const disabled = await get("/test-series", USER.rvHelen, TENANT.riverside);
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
