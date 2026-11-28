import {
  DoubtAnswerSchema,
  DoubtSchema,
  ParentReportSchema,
  TestRankSchema,
  TestSeriesSchema,
  WeakTopicPlanSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, param } from "./route";

const SERIES = { module: "M40", permission: "m40.series.read" } as const;

function learnerFilter(tenantId: string, url: URL): string | null {
  const learnerId = param(url, "learnerId");
  if (learnerId !== null) {
    const exists = ofTenant(mockDb.learners, tenantId).some((row) => row.id === learnerId);
    if (!exists) throw new ApiFailure("not_found");
  }
  return learnerId;
}

export const m40Handlers = [
  get("/test-series", SERIES, (ctx) =>
    list(ctx, ofTenant(mockDb.testSeries, ctx.viewer.tenantId), pageSchema(TestSeriesSchema)),
  ),
  get("/test-series/:id/ranks", SERIES, (ctx) => {
    const series = found(
      ofTenant(mockDb.testSeries, ctx.viewer.tenantId).find((row) => row.id === ctx.params["id"]),
    );
    const rows = ofTenant(mockDb.testRanks, ctx.viewer.tenantId).filter(
      (row) => row.seriesId === series.id,
    );
    return list(ctx, rows, pageSchema(TestRankSchema));
  }),
  get("/doubts", SERIES, (ctx) => {
    const learnerId = learnerFilter(ctx.viewer.tenantId, ctx.url);
    const rows = ofTenant(mockDb.doubts, ctx.viewer.tenantId).filter(
      (row) => learnerId === null || row.learnerId === learnerId,
    );
    return list(ctx, rows, pageSchema(DoubtSchema));
  }),
  get("/doubts/:id/answers", SERIES, (ctx) => {
    const doubt = found(
      ofTenant(mockDb.doubts, ctx.viewer.tenantId).find((row) => row.id === ctx.params["id"]),
    );
    const rows = ofTenant(mockDb.doubtAnswers, ctx.viewer.tenantId).filter(
      (row) => row.doubtId === doubt.id,
    );
    return list(ctx, rows, pageSchema(DoubtAnswerSchema));
  }),
  get("/weak-topic-plans", SERIES, (ctx) => {
    const learnerId = learnerFilter(ctx.viewer.tenantId, ctx.url);
    const rows = ofTenant(mockDb.weakTopicPlans, ctx.viewer.tenantId).filter(
      (row) => learnerId === null || row.learnerId === learnerId,
    );
    return list(ctx, rows, pageSchema(WeakTopicPlanSchema));
  }),
  get("/parent-reports", SERIES, (ctx) => {
    const learnerId = learnerFilter(ctx.viewer.tenantId, ctx.url);
    const rows = ofTenant(mockDb.parentReports, ctx.viewer.tenantId).filter(
      (row) => learnerId === null || row.learnerId === learnerId,
    );
    return list(ctx, rows, pageSchema(ParentReportSchema));
  }),
];
