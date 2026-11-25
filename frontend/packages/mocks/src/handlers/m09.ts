import {
  ColumnMappingSchema,
  ImportJobInputSchema,
  ImportJobSchema,
  ImportRowIssueSchema,
  PromotionDecisionInputSchema,
  PromotionDecisionSchema,
  RolloverRunInputSchema,
  RolloverRunSchema,
  pageSchema,
  type ImportJobInput,
  type PromotionDecision,
  type RolloverCounts,
  type RolloverRun,
} from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, type RouteContext } from "./route";

const IMPORT = { module: "M09", permission: "m09.import.read" } as const;
const ROLLOVER = { module: "M86", permission: "m86.rollover.read" } as const;
const ROLLBACK_DAYS = 14;
const OPEN_RUN = new Set<RolloverRun["status"]>(["draft", "dry_run_ready", "running"]);

/** Module → `m86.rollover.manage` → active staff profile today (D84); returns the viewer and the staff profile. */
function rolloverManager(request: Request) {
  const viewer = readViewer(request);
  const { tenantId } = viewer;
  if (!entitled(tenantId, "M86")) throw new ApiFailure("module_disabled");
  if (!viewer.permissions.has("m86.rollover.manage")) throw new ApiFailure("forbidden");
  const today = new Date().toISOString().slice(0, 10);
  const staff = ofTenant(mockDb.roleProfiles, tenantId).find(
    (row) =>
      row.kind === "staff" &&
      row.personId === viewer.personId &&
      row.status === "active" &&
      row.effectiveFrom <= today &&
      (row.effectiveTo === null || row.effectiveTo >= today),
  );
  if (!staff) throw new ApiFailure("forbidden");
  return { viewer, staffId: staff.id };
}

async function readBody(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}

function invalid(path: string, message: string): ApiFailure {
  return new ApiFailure("invalid_request", [{ path, message }]);
}

function countsOf(decisions: readonly PromotionDecision[]): RolloverCounts {
  const counts: RolloverCounts = { promote: 0, detain: 0, graduate: 0, transfer: 0, skip: 0 };
  for (const decision of decisions) counts[decision.action] += 1;
  return counts;
}

function bump(run: RolloverRun, changes: Partial<RolloverRun>): RolloverRun {
  const now = new Date().toISOString();
  const next = RolloverRunSchema.parse({
    ...run,
    ...changes,
    updatedAt: Date.parse(now) >= Date.parse(run.updatedAt) ? now : run.updatedAt,
  });
  Object.assign(run, next);
  return next;
}

type DecisionPlan = readonly [PromotionDecision["action"], string | null, string | null];

/** D84 dry run: promote to the next year level's first to-year group, else graduate or skip with a reason. */
function dryRun(
  tenantId: string,
  runId: string,
  institutionId: string,
  fromYear: string,
  toYear: string,
): PromotionDecision[] {
  const groups = ofTenant(mockDb.classGroups, tenantId).filter(
    (row) => row.institutionId === institutionId,
  );
  const fromGroups = new Map(
    groups.filter((row) => row.academicYearId === fromYear).map((row) => [row.id, row]),
  );
  const levels = ofTenant(mockDb.yearLevels, tenantId);
  const decisions: PromotionDecision[] = [];
  const seen = new Set<string>();
  for (const enrolment of ofTenant(mockDb.enrolments, tenantId)) {
    const group = fromGroups.get(enrolment.classGroupId);
    if (!group || enrolment.status !== "active" || seen.has(enrolment.learnerId)) continue;
    seen.add(enrolment.learnerId);
    const level = levels.find((row) => row.id === group.yearLevelId);
    const next = level
      ? levels.find((row) => row.programId === level.programId && row.order === level.order + 1)
      : undefined;
    const target = next
      ? groups
          .filter(
            (row) =>
              row.academicYearId === toYear &&
              row.programId === next.programId &&
              row.yearLevelId === next.id,
          )
          .sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id))[0]
      : undefined;
    let plan: DecisionPlan = ["skip", null, "m86.promotion.noTargetGroup"];
    if (!level) plan = ["skip", null, "m86.promotion.noYearLevel"];
    else if (!next) plan = ["graduate", null, null];
    else if (target) plan = ["promote", target.id, null];
    decisions.push(
      PromotionDecisionSchema.parse({
        id: `pd-${globalThis.crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        runId,
        learnerId: enrolment.learnerId,
        action: plan[0],
        toClassGroupId: plan[1],
        reasonKey: plan[2],
        overriddenByStaffProfileId: null,
      }),
    );
  }
  return decisions;
}

function runFor(tenantId: string, id: unknown): RolloverRun {
  return found(ofTenant(mockDb.rolloverRuns, tenantId).find((row) => row.id === id));
}

type WriteHandler = (request: Request, params: Record<string, unknown>) => Promise<Response>;

function withFailure(handler: WriteHandler) {
  return async ({ request, params }: { request: Request; params: Record<string, unknown> }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      return await handler(request, params);
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  };
}

function issues(error: { issues: readonly { path: readonly PropertyKey[] }[] }, message: string) {
  return new ApiFailure(
    "invalid_request",
    error.issues.map((issue) => ({ path: String(issue.path[0] ?? ""), message })),
  );
}

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
  http.post(
    `*${API_BASE}/rollover-runs`,
    withFailure(async (request) => {
      const { viewer, staffId } = rolloverManager(request);
      const { tenantId } = viewer;
      const parsed = RolloverRunInputSchema.safeParse(await readBody(request));
      if (!parsed.success) throw issues(parsed.error, "Invalid rollover run");
      const input = parsed.data;
      if (!ofTenant(mockDb.institutions, tenantId).some((row) => row.id === input.institutionId)) {
        throw invalid("institutionId", "Invalid institution");
      }
      const calendars = ofTenant(mockDb.calendars, tenantId);
      for (const key of ["fromAcademicYearId", "toAcademicYearId"] as const) {
        if (!calendars.some((row) => row.id === input[key])) {
          throw invalid(key, "Invalid academic year");
        }
      }
      const open = ofTenant(mockDb.rolloverRuns, tenantId).some(
        (row) =>
          row.institutionId === input.institutionId &&
          row.fromAcademicYearId === input.fromAcademicYearId &&
          OPEN_RUN.has(row.status),
      );
      if (open) {
        throw new ApiFailure("conflict", [
          { path: "fromAcademicYearId", message: "A rollover run is already open for this year" },
        ]);
      }
      const now = new Date().toISOString();
      const id = `roll-${globalThis.crypto.randomUUID().slice(0, 8)}`;
      const decisions = dryRun(
        tenantId,
        id,
        input.institutionId,
        input.fromAcademicYearId,
        input.toAcademicYearId,
      );
      const run = RolloverRunSchema.parse({
        id,
        tenantId,
        ...input,
        status: "dry_run_ready",
        counts: countsOf(decisions),
        rollbackUntil: null,
        createdByStaffProfileId: staffId,
        createdAt: now,
        updatedAt: now,
      });
      mockDb.rolloverRuns.push(run);
      mockDb.promotionDecisions.push(...decisions);
      return HttpResponse.json(run as JsonBodyType, { status: 201 });
    }),
  ),
  http.put(
    `*${API_BASE}/rollover-runs/:id/decisions/:decisionId`,
    withFailure(async (request, params) => {
      const { viewer, staffId } = rolloverManager(request);
      const { tenantId } = viewer;
      const raw = await readBody(request);
      const run = runFor(tenantId, params["id"]);
      const decision = found(
        ofTenant(mockDb.promotionDecisions, tenantId).find(
          (row) => row.id === params["decisionId"] && row.runId === run.id,
        ),
      );
      if (run.status !== "dry_run_ready") {
        throw new ApiFailure("conflict", [
          { path: "status", message: "The dry run is not open for changes" },
        ]);
      }
      const parsed = PromotionDecisionInputSchema.safeParse(raw);
      if (!parsed.success) throw issues(parsed.error, "Invalid decision");
      const input = parsed.data;
      const targetOk =
        input.toClassGroupId === null ||
        ofTenant(mockDb.classGroups, tenantId).some(
          (row) =>
            row.id === input.toClassGroupId &&
            row.academicYearId === run.toAcademicYearId &&
            row.institutionId === run.institutionId,
        );
      if (!targetOk) {
        throw invalid("toClassGroupId", "Choose a class group of the next academic year");
      }
      const next = PromotionDecisionSchema.parse({
        ...decision,
        ...input,
        overriddenByStaffProfileId: staffId,
      });
      Object.assign(decision, next);
      const decisions = ofTenant(mockDb.promotionDecisions, tenantId).filter(
        (row) => row.runId === run.id,
      );
      bump(run, { counts: countsOf(decisions) });
      return HttpResponse.json(next as JsonBodyType);
    }),
  ),
  http.post(
    `*${API_BASE}/rollover-runs/:id/confirm`,
    withFailure(async (request, params) => {
      const { viewer } = rolloverManager(request);
      const run = runFor(viewer.tenantId, params["id"]);
      if (run.status !== "dry_run_ready") {
        throw new ApiFailure("conflict", [
          { path: "status", message: "The dry run is not ready to confirm" },
        ]);
      }
      const until = new Date(Date.now() + ROLLBACK_DAYS * 86_400_000).toISOString();
      const next = bump(run, { status: "completed", rollbackUntil: until });
      return HttpResponse.json(next as JsonBodyType);
    }),
  ),
  http.post(
    `*${API_BASE}/rollover-runs/:id/rollback`,
    withFailure(async (request, params) => {
      const { viewer } = rolloverManager(request);
      const run = runFor(viewer.tenantId, params["id"]);
      const open =
        run.status === "completed" &&
        run.rollbackUntil !== null &&
        Date.parse(run.rollbackUntil) > Date.now();
      if (!open) {
        throw new ApiFailure("conflict", [
          { path: "rollbackUntil", message: "The roll-back window has closed" },
        ]);
      }
      const next = bump(run, { status: "rolled_back", rollbackUntil: null });
      return HttpResponse.json(next as JsonBodyType);
    }),
  ),
];
