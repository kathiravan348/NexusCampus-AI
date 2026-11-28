import {
  FlagReviewInputSchema,
  IdentityDecisionInputSchema,
  ProctoringFlagSchema,
  ProctoringSessionSchema,
  ProctoringSettingsSchema,
  RecordingSegmentSchema,
  pageSchema,
  type ProctoringFlag,
  type ProctoringSession,
} from "@nexus/contracts";
import { http } from "msw";
import type { ZodError } from "zod";
import {
  ApiFailure,
  apiError,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, ok, param } from "./route";

const MANAGE = { module: "M34", permission: "m34.proctoring.manage" } as const;
const REVIEW_PERMS = ["m34.flag.review", "m34.proctoring.manage"] as const;
const REVIEW = { module: "M34", permission: REVIEW_PERMS } as const;

function testById(tenantId: string, id: string | undefined) {
  return found(ofTenant(mockDb.onlineTests, tenantId).find((row) => row.id === id));
}

function sessionById(tenantId: string, id: unknown) {
  return found(ofTenant(mockDb.proctoringSessions, tenantId).find((row) => row.id === id));
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

function invalidDecision(error: ZodError) {
  return apiError(
    422,
    "invalid_request",
    error.issues.map((issue) => ({
      path: issue.path.join(".") || "body",
      message: "Invalid proctoring decision field",
    })),
  );
}

type DecisionRequest = { viewer: Viewer; key: string; raw: unknown };

async function runDecision(
  request: Request,
  permissions: readonly string[],
  decide: (ctx: DecisionRequest) => Response,
) {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readViewer(request);
    if (!entitled(viewer.tenantId, "M34")) throw new ApiFailure("module_disabled");
    if (!permissions.some((permission) => viewer.permissions.has(permission))) {
      throw new ApiFailure("forbidden");
    }
    const key = request.headers.get("Idempotency-Key");
    if (!key) throw new ApiFailure("invalid_request");
    const raw: unknown = await request.json().catch(() => undefined);
    return decide({ viewer, key, raw });
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

// Each record permits one decision. Receipts follow the saved row and expire with it on DB reset.
type Receipt = { staffId: string; key: string };
const flagReceipts = new WeakMap<ProctoringFlag, Receipt>();
const identityReceipts = new WeakMap<ProctoringSession, Receipt>();

export const m34Handlers = [
  get("/online-tests/:id/proctoring", MANAGE, (ctx) => {
    const test = testById(ctx.viewer.tenantId, ctx.params["id"]);
    const settings = found(
      ofTenant(mockDb.proctoringSettings, ctx.viewer.tenantId).find(
        (row) => row.testId === test.id,
      ),
    );
    return ok(ProctoringSettingsSchema, settings);
  }),
  get("/proctoring-sessions", MANAGE, (ctx) => {
    const testId = param(ctx.url, "testId");
    if (testId !== null) testById(ctx.viewer.tenantId, testId);
    const rows = ofTenant(mockDb.proctoringSessions, ctx.viewer.tenantId).filter(
      (row) => testId === null || row.testId === testId,
    );
    return list(ctx, rows, pageSchema(ProctoringSessionSchema));
  }),
  get("/proctoring-sessions/:id/flags", REVIEW, (ctx) => {
    const session = sessionById(ctx.viewer.tenantId, ctx.params["id"]);
    const rows = ofTenant(mockDb.proctoringFlags, ctx.viewer.tenantId).filter(
      (row) => row.sessionId === session.id,
    );
    return list(ctx, rows, pageSchema(ProctoringFlagSchema));
  }),
  get("/proctoring-sessions/:id/recordings", REVIEW, (ctx) => {
    const session = sessionById(ctx.viewer.tenantId, ctx.params["id"]);
    const rows = ofTenant(mockDb.recordingSegments, ctx.viewer.tenantId).filter(
      (row) => row.sessionId === session.id,
    );
    return list(ctx, rows, pageSchema(RecordingSegmentSchema));
  }),
  http.patch(`*${API_BASE}/proctoring-flags/:id/review`, ({ request, params }) =>
    runDecision(request, REVIEW_PERMS, ({ viewer, key, raw }) => {
      const flag = found(
        ofTenant(mockDb.proctoringFlags, viewer.tenantId).find((row) => row.id === params["id"]),
      );
      const staffId = activeStaffProfile(viewer).id;
      const receipt = flagReceipts.get(flag);
      if (receipt?.key === key && receipt.staffId === staffId) {
        return ok(ProctoringFlagSchema, flag);
      }
      if (flag.review !== "pending") throw new ApiFailure("conflict");
      const input = FlagReviewInputSchema.safeParse(raw);
      if (!input.success) return invalidDecision(input.error);

      const updated: ProctoringFlag = {
        ...flag,
        review: input.data.review,
        reviewNote: input.data.note,
        reviewedByStaffProfileId: staffId,
        reviewedAt: new Date().toISOString(),
      };
      const response = ok(ProctoringFlagSchema, updated);
      mockDb.proctoringFlags[mockDb.proctoringFlags.indexOf(flag)] = updated;
      flagReceipts.set(updated, { staffId, key });
      return response;
    }),
  ),
  http.patch(`*${API_BASE}/proctoring-sessions/:id/identity`, ({ request, params }) =>
    runDecision(request, [MANAGE.permission], ({ viewer, key, raw }) => {
      const session = sessionById(viewer.tenantId, params["id"]);
      const staffId = activeStaffProfile(viewer).id;
      const receipt = identityReceipts.get(session);
      if (receipt?.key === key && receipt.staffId === staffId) {
        return ok(ProctoringSessionSchema, session);
      }
      const settings = ofTenant(mockDb.proctoringSettings, viewer.tenantId).find(
        (row) => row.testId === session.testId,
      );
      if (!settings || settings.identityCheck === "none" || session.identityResult !== "pending") {
        throw new ApiFailure("conflict");
      }
      const input = IdentityDecisionInputSchema.safeParse(raw);
      if (!input.success) return invalidDecision(input.error);

      const updated: ProctoringSession = {
        ...session,
        identityResult: input.data.result,
        identityCheckedByStaffProfileId: staffId,
        identityCheckedAt: new Date().toISOString(),
      };
      const response = ok(ProctoringSessionSchema, updated);
      mockDb.proctoringSessions[mockDb.proctoringSessions.indexOf(session)] = updated;
      identityReceipts.set(updated, { staffId, key });
      return response;
    }),
  ),
];
