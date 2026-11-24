import {
  AssessmentSchema,
  AttendanceRosterEntrySchema,
  GradingSchemeSchema,
  MarkEntryInputSchema,
  MarkEntrySchema,
  RubricSchema,
  pageSchema,
  type Assessment,
  type MarkEntry,
  type Rubric,
} from "@nexus/contracts";
import { HttpResponse, http, type JsonBodyType } from "msw";
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
import { familyLearnerIds } from "./m18";
import { API_BASE, found, get, list, param } from "./route";

const M = { module: "M20" } as const;
const READ = "m20.marks.read";
const ENTER = "m20.marks.enter";
const staff = { ...M, permission: READ };

const receiptsByDb = new WeakMap<MarkEntry[], Map<string, MarkEntry>>();

function receiptStore(): Map<string, MarkEntry> {
  let store = receiptsByDb.get(mockDb.markEntries);
  if (!store) {
    store = new Map();
    receiptsByDb.set(mockDb.markEntries, store);
  }
  return store;
}

function assessmentFor(viewer: Viewer, id: unknown): Assessment {
  return found(ofTenant(mockDb.assessments, viewer.tenantId).find((row) => row.id === id));
}

function rosterFor(assessment: Assessment) {
  const offering = ofTenant(mockDb.subjectOfferings, assessment.tenantId).find(
    (row) => row.id === assessment.subjectOfferingId,
  );
  if (!offering) return [];
  const today = new Date().toISOString().slice(0, 10);
  const learners = new Set(ofTenant(mockDb.learners, assessment.tenantId).map((row) => row.id));
  const placements = ofTenant(mockDb.enrolments, assessment.tenantId)
    .filter(
      (row) =>
        learners.has(row.learnerId) &&
        row.classGroupId === offering.classGroupId &&
        row.effectiveFrom <= today &&
        (row.effectiveTo === null || row.effectiveTo >= today),
    )
    .sort(
      (a, b) =>
        Number(a.rollNumber === null) - Number(b.rollNumber === null) ||
        (a.rollNumber ?? "").localeCompare(b.rollNumber ?? "", "en", { numeric: true }) ||
        a.learnerId.localeCompare(b.learnerId),
    );
  const seen = new Set<string>();
  return placements.flatMap(({ learnerId, rollNumber }) => {
    if (seen.has(learnerId)) return [];
    seen.add(learnerId);
    return [{ learnerId, rollNumber }];
  });
}

function validRubricScores(rubric: Rubric, scores: Record<string, number> | null): boolean {
  if (scores === null) return false;
  if (Object.keys(scores).length !== rubric.criteria.length) return false;
  return rubric.criteria.every((criterion) => {
    if (!Object.prototype.hasOwnProperty.call(scores, criterion.code)) return false;
    const score = scores[criterion.code];
    return score !== undefined && criterion.levels.some((level) => level.score === score);
  });
}

export const m20Handlers = [
  get("/grading-schemes", staff, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.gradingSchemes, ctx.viewer.tenantId),
      pageSchema(GradingSchemeSchema),
    ),
  ),
  get("/assessments", staff, (ctx) => {
    const { tenantId } = ctx.viewer;
    const classGroupId = param(ctx.url, "classGroupId");
    const assessments = ofTenant(mockDb.assessments, tenantId);
    if (classGroupId === null) return list(ctx, assessments, pageSchema(AssessmentSchema));

    found(ofTenant(mockDb.classGroups, tenantId).find((row) => row.id === classGroupId));
    const offeringIds = new Set(
      ofTenant(mockDb.subjectOfferings, tenantId)
        .filter((row) => row.classGroupId === classGroupId)
        .map((row) => row.id),
    );
    return list(
      ctx,
      assessments.filter((row) => offeringIds.has(row.subjectOfferingId)),
      pageSchema(AssessmentSchema),
    );
  }),
  get("/rubrics", staff, (ctx) =>
    list(ctx, ofTenant(mockDb.rubrics, ctx.viewer.tenantId), pageSchema(RubricSchema)),
  ),
  get("/assessments/:id/roster", staff, (ctx) =>
    list(
      ctx,
      rosterFor(assessmentFor(ctx.viewer, ctx.params["id"])),
      pageSchema(AttendanceRosterEntrySchema),
    ),
  ),
  get("/assessments/:id/marks", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const assessment = found(
      ofTenant(mockDb.assessments, viewer.tenantId).find(
        (row) => row.id === ctx.params["id"] && (family === null || row.status === "published"),
      ),
    );
    const entries = ofTenant(mockDb.markEntries, viewer.tenantId)
      .filter(
        (row) =>
          row.assessmentId === assessment.id && (family === null || family.has(row.learnerId)),
      )
      .map((row) => (family === null ? row : { ...row, remark: null }));
    return list(ctx, entries, pageSchema(MarkEntrySchema));
  }),
  http.put(`*${API_BASE}/assessments/:id/marks/:learnerId`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      const { tenantId } = viewer;
      if (!entitled(tenantId, "M20")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has(ENTER)) throw new ApiFailure("forbidden");
      const today = new Date().toISOString().slice(0, 10);
      const staffProfile = ofTenant(mockDb.roleProfiles, tenantId).find(
        (row) =>
          row.kind === "staff" &&
          row.personId === viewer.personId &&
          (!("status" in row) || row.status === "active") &&
          row.effectiveFrom <= today &&
          (row.effectiveTo === null || row.effectiveTo >= today),
      );
      if (!staffProfile) throw new ApiFailure("forbidden");

      const assessment = assessmentFor(viewer, params["id"]);
      const learnerId = typeof params["learnerId"] === "string" ? params["learnerId"] : "";
      const key = request.headers.get("Idempotency-Key")?.trim() || null;
      const receipt = key ? JSON.stringify([tenantId, key]) : null;
      const raw: unknown = await request.json().catch(() => undefined);

      // No await between looking up the receipt and upserting the mark entry.
      const receipts = receiptStore();
      const previous = receipt ? receipts.get(receipt) : undefined;
      if (previous) return HttpResponse.json(previous as JsonBodyType, { status: 200 });

      if (assessment.status !== "open" && assessment.status !== "marking") {
        throw new ApiFailure("conflict", [
          { path: "status", message: "Assessment is not open for marking" },
        ]);
      }

      const parsed = MarkEntryInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((issue) => ({
            path: String(issue.path[0] ?? ""),
            message: "Invalid mark entry",
          })),
        );
      }
      const input = parsed.data;

      if (!rosterFor(assessment).some((row) => row.learnerId === learnerId)) {
        throw new ApiFailure("invalid_request", [
          { path: "learnerId", message: "Outside the assessment roster" },
        ]);
      }

      if (input.marks !== null && input.marks > assessment.maxMarks) {
        throw new ApiFailure("invalid_request", [
          { path: "marks", message: "Marks exceed the assessment maximum" },
        ]);
      }

      if (assessment.rubricId === null) {
        if (input.rubricScores !== null) {
          throw new ApiFailure("invalid_request", [
            { path: "rubricScores", message: "Assessment has no rubric" },
          ]);
        }
      } else if (input.absent) {
        if (input.rubricScores !== null) {
          throw new ApiFailure("invalid_request", [
            { path: "rubricScores", message: "Absent learner cannot have rubric scores" },
          ]);
        }
      } else {
        const rubric = ofTenant(mockDb.rubrics, tenantId).find(
          (row) => row.id === assessment.rubricId,
        );
        if (!rubric || !validRubricScores(rubric, input.rubricScores)) {
          throw new ApiFailure("invalid_request", [
            { path: "rubricScores", message: "Invalid rubric scores" },
          ]);
        }
      }

      const existingIndex = mockDb.markEntries.findIndex(
        (row) =>
          row.tenantId === tenantId &&
          row.assessmentId === assessment.id &&
          row.learnerId === learnerId,
      );
      const existing = existingIndex >= 0 ? mockDb.markEntries[existingIndex] : undefined;
      const entry = MarkEntrySchema.parse({
        ...input,
        id: existing ? existing.id : crypto.randomUUID(),
        tenantId,
        assessmentId: assessment.id,
        learnerId,
        enteredByStaffProfileId: staffProfile.id,
        enteredAt: new Date().toISOString(),
        deviceId: null,
      });

      if (existingIndex >= 0) {
        mockDb.markEntries[existingIndex] = entry;
      } else {
        mockDb.markEntries.push(entry);
      }
      if (receipt) receipts.set(receipt, entry);
      return HttpResponse.json(entry as JsonBodyType, { status: 200 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
