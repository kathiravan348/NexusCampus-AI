import {
  ProctoringFlagSchema,
  ProctoringSessionSchema,
  ProctoringSettingsSchema,
  RecordingSegmentSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, param } from "./route";

const MANAGE = { module: "M34", permission: "m34.proctoring.manage" } as const;
const REVIEW_PERMS = ["m34.flag.review", "m34.proctoring.manage"] as const;
const REVIEW = { module: "M34", permission: REVIEW_PERMS } as const;

function testById(tenantId: string, id: string | undefined) {
  return found(ofTenant(mockDb.onlineTests, tenantId).find((row) => row.id === id));
}

function sessionById(tenantId: string, id: string | undefined) {
  return found(ofTenant(mockDb.proctoringSessions, tenantId).find((row) => row.id === id));
}

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
];
