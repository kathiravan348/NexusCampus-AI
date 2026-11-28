import {
  CoverageEntrySchema,
  LessonPlanInputSchema,
  LessonPlanSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  SyllabusCoverageSchema,
  SyllabusUnitSchema,
  pageSchema,
  type LessonPlanInput,
} from "@nexus/contracts";
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
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, ok, param } from "./route";

const M = { module: "M29", permission: "m29.curriculum.read" } as const;
const WRITE = "m29.lessonplan.write";

const CoverageResponse = z.strictObject({
  coverage: SyllabusCoverageSchema,
  entries: z.array(CoverageEntrySchema),
});

const createReceipts = new Map<string, string>();
const updateReceipts = new Map<string, { readonly id: string; readonly updatedAt: string }>();

function badField(path: string, message: string): never {
  throw new ApiFailure("invalid_request", [{ path, message }]);
}

function checkFilter<T extends { id: string; tenantId: string }>(
  rows: readonly T[],
  tenantId: string,
  id: string | null,
): void {
  if (id !== null) found(ofTenant(rows, tenantId).find((row) => row.id === id));
}

function activeStaffProfile(viewer: Viewer) {
  const today = new Date().toISOString().slice(0, 10);
  const staff = ofTenant(mockDb.roleProfiles, viewer.tenantId).find(
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

function parseAndValidate(tenantId: string, staffId: string, raw: unknown): LessonPlanInput {
  const parsed = LessonPlanInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((issue) => ({
        path: String(issue.path[0] ?? ""),
        message: "Invalid lesson plan field",
      })),
    );
  }
  const input = parsed.data;
  if (input.staffProfileId !== staffId) throw new ApiFailure("forbidden");
  const offering = ofTenant(mockDb.subjectOfferings, tenantId).find(
    (row) => row.id === input.subjectOfferingId,
  );
  if (!offering) badField("subjectOfferingId", "Invalid subject offering");
  if (
    input.timetableSlotId !== null &&
    !ofTenant(mockDb.timetableSlots, tenantId).some(
      (row) => row.id === input.timetableSlotId && row.subjectOfferingId === offering.id,
    )
  ) {
    badField("timetableSlotId", "Invalid timetable slot");
  }
  const subjectTopics = new Set(
    ofTenant(mockDb.syllabusUnits, tenantId)
      .filter((row) => row.subjectId === offering.subjectId)
      .flatMap((row) => row.topics.map((topic) => topic.id)),
  );
  if (input.topicIds.some((id) => !subjectTopics.has(id))) {
    badField("topicIds", "Invalid syllabus topic");
  }
  const tenantOutcomes = new Set(ofTenant(mockDb.outcomes, tenantId).map((row) => row.id));
  if (input.outcomeIds.some((id) => !tenantOutcomes.has(id))) {
    badField("outcomeIds", "Invalid outcome");
  }
  return input;
}

type WriteCtx = { tenantId: string; staffId: string; raw: unknown; key: string | null };

async function runWrite(request: Request, handle: (ctx: WriteCtx) => Response): Promise<Response> {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readViewer(request);
    if (!entitled(viewer.tenantId, "M29")) throw new ApiFailure("module_disabled");
    if (!viewer.permissions.has(WRITE)) throw new ApiFailure("forbidden");
    const staff = activeStaffProfile(viewer);
    const raw: unknown = await request.json().catch(() => undefined);
    return handle({
      tenantId: viewer.tenantId,
      staffId: staff.id,
      raw,
      key: request.headers.get("Idempotency-Key"),
    });
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

export const m29Handlers = [
  get("/outcome-frameworks", M, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.outcomeFrameworks, ctx.viewer.tenantId),
      pageSchema(OutcomeFrameworkSchema),
    ),
  ),
  get("/outcomes", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const frameworkId = param(ctx.url, "frameworkId");
    checkFilter(mockDb.outcomeFrameworks, tenantId, frameworkId);
    const rows = ofTenant(mockDb.outcomes, tenantId);
    return list(
      ctx,
      rows.filter((row) => frameworkId === null || row.frameworkId === frameworkId),
      pageSchema(OutcomeSchema),
    );
  }),
  get("/outcome-mappings", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const frameworkId = param(ctx.url, "frameworkId");
    checkFilter(mockDb.outcomeFrameworks, tenantId, frameworkId);
    const rows = ofTenant(mockDb.outcomeMappings, tenantId);
    const outcomeIds = new Set(
      ofTenant(mockDb.outcomes, tenantId)
        .filter((row) => row.frameworkId === frameworkId)
        .map((row) => row.id),
    );
    return list(
      ctx,
      rows.filter(
        (row) =>
          frameworkId === null ||
          outcomeIds.has(row.fromOutcomeId) ||
          outcomeIds.has(row.toOutcomeId),
      ),
      pageSchema(OutcomeMappingSchema),
    );
  }),
  get("/syllabus-units", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const subjectId = param(ctx.url, "subjectId");
    checkFilter(mockDb.subjects, tenantId, subjectId);
    const rows = ofTenant(mockDb.syllabusUnits, tenantId);
    return list(
      ctx,
      rows.filter((row) => subjectId === null || row.subjectId === subjectId),
      pageSchema(SyllabusUnitSchema),
    );
  }),
  get("/lesson-plans", M, (ctx) => {
    const { tenantId, permissions } = ctx.viewer;
    if (!permissions.has("m29.lessonplan.write") && !permissions.has("m29.lessonplan.review")) {
      throw new ApiFailure("forbidden");
    }
    const subjectOfferingId = param(ctx.url, "subjectOfferingId");
    checkFilter(mockDb.subjectOfferings, tenantId, subjectOfferingId);
    const rows = ofTenant(mockDb.lessonPlans, tenantId);
    return list(
      ctx,
      rows.filter(
        (row) => subjectOfferingId === null || row.subjectOfferingId === subjectOfferingId,
      ),
      pageSchema(LessonPlanSchema),
    );
  }),
  get("/syllabus-coverage", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const subjectOfferingId = param(ctx.url, "subjectOfferingId");
    if (subjectOfferingId === null) throw new ApiFailure("invalid_request");
    const offering = found(
      ofTenant(mockDb.subjectOfferings, tenantId).find((row) => row.id === subjectOfferingId),
    );
    const group = found(
      ofTenant(mockDb.classGroups, tenantId).find((row) => row.id === offering.classGroupId),
    );
    const topics = new Set(
      ofTenant(mockDb.syllabusUnits, tenantId)
        .filter(
          (row) => row.subjectId === offering.subjectId && row.yearLevelId === group.yearLevelId,
        )
        .flatMap((row) => row.topics.map((topic) => topic.id)),
    );
    const entries = ofTenant(mockDb.coverageEntries, tenantId).filter(
      (row) => row.subjectOfferingId === subjectOfferingId,
    );
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
    runWrite(request, ({ tenantId, staffId, raw, key }) => {
      const receiptKey = key ? JSON.stringify([tenantId, "POST", key]) : null;
      const previousId = receiptKey ? createReceipts.get(receiptKey) : undefined;
      if (previousId) {
        const previous = mockDb.lessonPlans.find(
          (row) => row.id === previousId && row.tenantId === tenantId,
        );
        if (previous) return HttpResponse.json(previous as JsonBodyType, { status: 201 });
      }
      const input = parseAndValidate(tenantId, staffId, raw);
      const now = new Date().toISOString();
      const created = LessonPlanSchema.parse({
        ...input,
        id: `lpl-${globalThis.crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        status: "draft",
        reviewedByStaffProfileId: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: now,
        updatedAt: now,
      });
      mockDb.lessonPlans.push(created);
      if (receiptKey) createReceipts.set(receiptKey, created.id);
      return HttpResponse.json(created as JsonBodyType, { status: 201 });
    }),
  ),
  http.put(`*${API_BASE}/lesson-plans/:id`, ({ request, params }) =>
    runWrite(request, ({ tenantId, staffId, raw, key }) => {
      const id = typeof params["id"] === "string" ? params["id"] : "";
      const index = mockDb.lessonPlans.findIndex(
        (row) => row.id === id && row.tenantId === tenantId,
      );
      if (index === -1) throw new ApiFailure("not_found");
      const existing = mockDb.lessonPlans[index]!;
      if (existing.staffProfileId !== staffId) throw new ApiFailure("forbidden");
      const receiptKey = key ? JSON.stringify([tenantId, "PUT", existing.id, key]) : null;
      const saved = receiptKey ? updateReceipts.get(receiptKey) : undefined;
      if (saved && existing.id === saved.id && existing.updatedAt === saved.updatedAt) {
        return HttpResponse.json(existing as JsonBodyType, { status: 200 });
      }
      if (existing.status !== "draft" && existing.status !== "returned") {
        throw new ApiFailure("conflict", [
          { path: "status", message: "Only draft or returned lesson plans can be edited" },
        ]);
      }
      const input = parseAndValidate(tenantId, staffId, raw);
      const updated = LessonPlanSchema.parse({
        ...existing,
        ...input,
        id: existing.id,
        tenantId,
        status: existing.status,
        reviewedByStaffProfileId: existing.reviewedByStaffProfileId,
        reviewedAt: existing.reviewedAt,
        reviewNote: existing.reviewNote,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      mockDb.lessonPlans[index] = updated;
      if (receiptKey) {
        updateReceipts.set(receiptKey, { id: updated.id, updatedAt: updated.updatedAt });
      }
      return HttpResponse.json(updated as JsonBodyType, { status: 200 });
    }),
  ),
];
