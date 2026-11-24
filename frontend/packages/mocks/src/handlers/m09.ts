import {
  ColumnMappingSchema,
  ImportJobInputSchema,
  ImportJobSchema,
  ImportRowIssueSchema,
  PromotionDecisionSchema,
  RolloverRunSchema,
  pageSchema,
  type ImportJobInput,
} from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, type RouteContext } from "./route";

const IMPORT = { module: "M09", permission: "m09.import.read" } as const;
const ROLLOVER = { module: "M86", permission: "m86.rollover.read" } as const;

function importJob(ctx: RouteContext) {
  return found(
    ofTenant(mockDb.importJobs, ctx.viewer.tenantId).find((row) => row.id === ctx.params["id"]),
  );
}

async function readImportJobInput(request: Request): Promise<ImportJobInput> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
  }
  const parsed = ImportJobInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

export const m09Handlers = [
  get("/import-jobs", IMPORT, (ctx) =>
    list(ctx, ofTenant(mockDb.importJobs, ctx.viewer.tenantId), pageSchema(ImportJobSchema)),
  ),
  http.post(`*${API_BASE}/import-jobs`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, "M09")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has("m09.import.manage")) throw new ApiFailure("forbidden");
      const staffProfile = ofTenant(mockDb.roleProfiles, viewer.tenantId).find(
        (row) =>
          row.personId === viewer.personId && row.kind === "staff" && row.status === "active",
      );
      if (!staffProfile) throw new ApiFailure("forbidden");
      const input = await readImportJobInput(request);
      const now = new Date().toISOString();
      const created = ImportJobSchema.parse({
        id: `imp-${globalThis.crypto.randomUUID().slice(0, 8)}`,
        tenantId: viewer.tenantId,
        entity: input.entity,
        fileName: input.fileName,
        sourceFormat: input.sourceFormat,
        templateVersion: 1,
        status: "uploaded",
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        createdByStaffProfileId: staffProfile.id,
        rollbackUntil: null,
        createdAt: now,
        updatedAt: now,
      });
      mockDb.importJobs.push(created);
      return HttpResponse.json(created as JsonBodyType, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
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
