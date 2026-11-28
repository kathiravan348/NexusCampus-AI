import * as schemas from "@nexus/contracts";
import type { LessonPlan } from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
import { z } from "zod";
import {
  ApiFailure,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb as db } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, ok, param } from "./route";

const M = { module: "M29", permission: "m29.curriculum.read" } as const;
const WRITE = "m29.lessonplan.write";

const CoverageResponse = z.strictObject({
  coverage: schemas.SyllabusCoverageSchema,
  entries: z.array(schemas.CoverageEntrySchema),
});

const noReview = { reviewedByStaffProfileId: null, reviewedAt: null, reviewNote: null };

function badField(path: string, message: string): never {
  throw new ApiFailure("invalid_request", [{ path, message }]);
}

type TenantRow = { id: string; tenantId: string };
function byId<T extends TenantRow>(rows: readonly T[], tenantId: string, id: unknown) {
  return ofTenant(rows, tenantId).find((row) => row.id === id);
}
function filterId(ctx: { viewer: Viewer; url: URL }, name: string, parents: readonly TenantRow[]) {
  const id = param(ctx.url, name);
  if (id !== null) found(byId(parents, ctx.viewer.tenantId, id));
  return id;
}

function filtered<T extends { tenantId: string }>(
  rows: readonly T[],
  tenantId: string,
  field: keyof T,
  value: string | null,
) {
  return ofTenant(rows, tenantId).filter((row) => value === null || row[field] === value);
}

function activeStaffProfile(viewer: Viewer) {
  const today = new Date().toISOString().slice(0, 10);
  const staff = ofTenant(db.roleProfiles, viewer.tenantId).find(
    (row) =>
      row.kind === "staff" &&
      row.personId === viewer.personId &&
      row.status === "active" &&
      row.effectiveFrom <= today &&
      (row.effectiveTo === null || row.effectiveTo >= today),
  );
  if (!staff) throw new ApiFailure("forbidden");
  return staff;
}

function parseInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((issue) => ({
        path: String(issue.path[0] ?? ""),
        message: "Invalid lesson plan field",
      })),
    );
  }
  return parsed.data;
}

function parseAndValidate(tenantId: string, staffId: string, raw: unknown) {
  const input = parseInput(schemas.LessonPlanInputSchema, raw);
  if (input.staffProfileId !== staffId) throw new ApiFailure("forbidden");
  const offering = byId(db.subjectOfferings, tenantId, input.subjectOfferingId);
  if (!offering) badField("subjectOfferingId", "Invalid subject offering");
  if (
    input.timetableSlotId !== null &&
    !ofTenant(db.timetableSlots, tenantId).some(
      (row) => row.id === input.timetableSlotId && row.subjectOfferingId === offering.id,
    )
  ) {
    badField("timetableSlotId", "Invalid timetable slot");
  }
  const subjectTopics = new Set(
    ofTenant(db.syllabusUnits, tenantId)
      .filter((row) => row.subjectId === offering.subjectId)
      .flatMap((row) => row.topics.map((topic) => topic.id)),
  );
  if (input.topicIds.some((id) => !subjectTopics.has(id))) {
    badField("topicIds", "Invalid syllabus topic");
  }
  const tenantOutcomes = new Set(ofTenant(db.outcomes, tenantId).map((row) => row.id));
  if (input.outcomeIds.some((id) => !tenantOutcomes.has(id))) {
    badField("outcomeIds", "Invalid outcome");
  }
  return input;
}

type WriteCtx = { tenantId: string; staffId: string; raw: unknown; key: string | null };

async function runWrite(
  request: Request,
  permission: typeof WRITE | "m29.lessonplan.review",
  handle: (ctx: WriteCtx) => Response,
) {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readViewer(request);
    if (!entitled(viewer.tenantId, "M29")) throw new ApiFailure("module_disabled");
    if (!viewer.permissions.has(permission)) throw new ApiFailure("forbidden");
    const staffId = activeStaffProfile(viewer).id;
    const raw: unknown = await request.json().catch(() => undefined);
    const key = request.headers.get("Idempotency-Key");
    return handle({ tenantId: viewer.tenantId, staffId, raw, key });
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

type Action = "update" | "submit" | "review" | "delivered";
const actionReceipts = new WeakMap<LessonPlan, Map<string, LessonPlan>>();
const createReceipts = new Map<string, string>();

function coverTopics(plan: LessonPlan, coveredOn: string) {
  const { tenantId, subjectOfferingId, updatedAt } = plan;
  const rows = filtered(db.coverageEntries, tenantId, "subjectOfferingId", subjectOfferingId);
  for (const topicId of plan.topicIds) {
    const existing = rows.find((row) => row.topicId === topicId);
    const fields = { status: "covered" as const, coveredOn, lessonPlanId: plan.id, updatedAt };
    if (existing)
      db.coverageEntries[db.coverageEntries.indexOf(existing)] = { ...existing, ...fields };
    else {
      const id = `cve-${globalThis.crypto.randomUUID()}`;
      db.coverageEntries.push({ id, tenantId, subjectOfferingId, topicId, ...fields });
    }
  }
}

const editable = (plan: LessonPlan) => plan.status === "draft" || plan.status === "returned";

function transition(action: Action, plan: LessonPlan, { raw, staffId }: WriteCtx): LessonPlan {
  const updatedAt = new Date().toISOString();
  switch (action) {
    case "update": {
      if (!editable(plan))
        throw new ApiFailure("conflict", [{ path: "status", message: "Plan is not editable" }]);
      return { ...plan, ...parseAndValidate(plan.tenantId, staffId, raw), updatedAt };
    }
    case "submit":
      if (!editable(plan)) throw new ApiFailure("conflict");
      parseInput(schemas.LessonPlanSubmitInputSchema, raw);
      return { ...plan, status: "submitted", ...noReview, updatedAt };
    case "review": {
      if (plan.status !== "submitted") throw new ApiFailure("conflict");
      const { decision, note } = parseInput(schemas.LessonPlanReviewInputSchema, raw);
      return {
        ...plan,
        status: decision === "approve" ? "approved" : "returned",
        reviewedByStaffProfileId: staffId,
        reviewedAt: updatedAt,
        reviewNote: note,
        updatedAt,
      };
    }
    case "delivered": {
      if (plan.status !== "approved") throw new ApiFailure("conflict");
      const { deliveredOn } = parseInput(schemas.LessonPlanDeliveredInputSchema, raw);
      if (deliveredOn > updatedAt.slice(0, 10)) badField("deliveredOn", "Date is in the future");
      const delivered = { ...plan, status: "delivered" as const, updatedAt };
      coverTopics(delivered, deliveredOn);
      return delivered;
    }
  }
}

function actionRoute(action: Action) {
  const permission = action === "review" ? "m29.lessonplan.review" : WRITE;
  const method = action === "update" ? http.put : http.post;
  const suffix = action === "update" ? "" : `/${action}`;
  return method(`*${API_BASE}/lesson-plans/:id${suffix}`, ({ request, params }) =>
    runWrite(request, permission, (ctx) => {
      const plan = found(byId(db.lessonPlans, ctx.tenantId, params["id"]));
      const own = plan.staffProfileId === ctx.staffId;
      if (action === "review" ? own : !own) throw new ApiFailure("forbidden");
      const key = ctx.key && JSON.stringify([ctx.tenantId, plan.id, ctx.staffId, action, ctx.key]);
      const receipts = actionReceipts.get(plan) ?? new Map<string, LessonPlan>();
      const receipt = key ? receipts.get(key) : undefined;
      if (receipt && (action !== "update" || receipt === plan))
        return ok(schemas.LessonPlanSchema, receipt);
      const updated = transition(action, plan, ctx);
      db.lessonPlans[db.lessonPlans.indexOf(plan)] = updated;
      if (key) receipts.set(key, updated);
      actionReceipts.set(updated, receipts);
      return ok(schemas.LessonPlanSchema, updated);
    }),
  );
}

export const m29Handlers = [
  get("/outcome-frameworks", M, (ctx) =>
    list(
      ctx,
      ofTenant(db.outcomeFrameworks, ctx.viewer.tenantId),
      schemas.pageSchema(schemas.OutcomeFrameworkSchema),
    ),
  ),
  get("/outcomes", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const frameworkId = filterId(ctx, "frameworkId", db.outcomeFrameworks);
    const rows = filtered(db.outcomes, tenantId, "frameworkId", frameworkId);
    return list(ctx, rows, schemas.pageSchema(schemas.OutcomeSchema));
  }),
  get("/outcome-mappings", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const frameworkId = filterId(ctx, "frameworkId", db.outcomeFrameworks);
    const ids = new Set(
      filtered(db.outcomes, tenantId, "frameworkId", frameworkId).map((o) => o.id),
    );
    const rows = ofTenant(db.outcomeMappings, tenantId).filter(
      (row) => frameworkId === null || ids.has(row.fromOutcomeId) || ids.has(row.toOutcomeId),
    );
    return list(ctx, rows, schemas.pageSchema(schemas.OutcomeMappingSchema));
  }),
  get("/syllabus-units", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const subjectId = filterId(ctx, "subjectId", db.subjects);
    const rows = filtered(db.syllabusUnits, tenantId, "subjectId", subjectId);
    return list(ctx, rows, schemas.pageSchema(schemas.SyllabusUnitSchema));
  }),
  get("/lesson-plans", M, (ctx) => {
    const { tenantId, permissions } = ctx.viewer;
    if (!permissions.has("m29.lessonplan.write") && !permissions.has("m29.lessonplan.review")) {
      throw new ApiFailure("forbidden");
    }
    const subjectOfferingId = filterId(ctx, "subjectOfferingId", db.subjectOfferings);
    const rows = filtered(db.lessonPlans, tenantId, "subjectOfferingId", subjectOfferingId);
    return list(ctx, rows, schemas.pageSchema(schemas.LessonPlanSchema));
  }),
  get("/syllabus-coverage", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const subjectOfferingId = param(ctx.url, "subjectOfferingId");
    if (subjectOfferingId === null) throw new ApiFailure("invalid_request");
    const offering = found(byId(db.subjectOfferings, tenantId, subjectOfferingId));
    const group = found(byId(db.classGroups, tenantId, offering.classGroupId));
    const topics = new Set(
      filtered(db.syllabusUnits, tenantId, "subjectId", offering.subjectId)
        .filter((row) => row.yearLevelId === null || row.yearLevelId === group.yearLevelId)
        .flatMap((row) => row.topics.map((topic) => topic.id)),
    );
    const entries = filtered(db.coverageEntries, tenantId, "subjectOfferingId", subjectOfferingId);
    const covered = new Set(
      entries
        .filter((row) => row.status === "covered" && topics.has(row.topicId))
        .map((row) => row.topicId),
    );
    return ok(CoverageResponse, {
      coverage: {
        subjectOfferingId,
        topicsTotal: topics.size,
        topicsCovered: covered.size,
        percentBps: topics.size === 0 ? 0 : Math.round((covered.size * 10000) / topics.size),
      },
      entries,
    });
  }),
  http.post(`*${API_BASE}/lesson-plans`, ({ request }) =>
    runWrite(request, WRITE, ({ tenantId, staffId, raw, key }) => {
      const receiptKey = key && JSON.stringify([tenantId, staffId, "create", key]);
      const savedId = receiptKey && createReceipts.get(receiptKey);
      const saved = savedId && byId(db.lessonPlans, tenantId, savedId);
      if (saved) return HttpResponse.json(saved as JsonBodyType, { status: 201 });
      const input = parseAndValidate(tenantId, staffId, raw);
      const now = new Date().toISOString();
      const created = schemas.LessonPlanSchema.parse({
        ...input,
        id: `lpl-${globalThis.crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        status: "draft",
        ...noReview,
        createdAt: now,
        updatedAt: now,
      });
      db.lessonPlans.push(created);
      if (receiptKey) createReceipts.set(receiptKey, created.id);
      return HttpResponse.json(created as JsonBodyType, { status: 201 });
    }),
  ),
  ...(["update", "submit", "review", "delivered"] as const).map(actionRoute),
];
