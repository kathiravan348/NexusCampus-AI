import {
  ColumnMappingSchema,
  ImportJobSchema,
  ImportRowIssueSchema,
  PromotionDecisionSchema,
  RolloverRunSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, type RouteContext } from "./route";

const IMPORT = { module: "M09", permission: "m09.import.read" } as const;
const ROLLOVER = { module: "M86", permission: "m86.rollover.read" } as const;

function importJob(ctx: RouteContext) {
  return found(
    ofTenant(mockDb.importJobs, ctx.viewer.tenantId).find((row) => row.id === ctx.params["id"]),
  );
}

export const m09Handlers = [
  get("/import-jobs", IMPORT, (ctx) =>
    list(ctx, ofTenant(mockDb.importJobs, ctx.viewer.tenantId), pageSchema(ImportJobSchema)),
  ),
  get("/import-jobs/:id/mappings", IMPORT, (ctx) => {
    // Mappings and issues belong to the tenant through their import job.
    const job = importJob(ctx);
    const mappings = mockDb.columnMappings.filter((row) => row.jobId === job.id);
    return list(ctx, mappings, pageSchema(ColumnMappingSchema));
  }),
  get("/import-jobs/:id/issues", IMPORT, (ctx) => {
    const job = importJob(ctx);
    const issues = mockDb.importRowIssues[job.id] ?? [];
    return list(ctx, issues, pageSchema(ImportRowIssueSchema));
  }),
  get("/rollover-runs", ROLLOVER, (ctx) => {
    const runs = ofTenant(mockDb.rolloverRuns, ctx.viewer.tenantId);
    return list(ctx, runs, pageSchema(RolloverRunSchema));
  }),
  get("/rollover-runs/:id/decisions", ROLLOVER, (ctx) => {
    const { tenantId } = ctx.viewer;
    const runs = ofTenant(mockDb.rolloverRuns, tenantId);
    const run = found(runs.find((row) => row.id === ctx.params["id"]));
    const decisions = ofTenant(mockDb.promotionDecisions, tenantId).filter(
      (row) => row.runId === run.id,
    );
    return list(ctx, decisions, pageSchema(PromotionDecisionSchema));
  }),
];
