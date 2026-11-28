import {
  CatalogueCourseSchema,
  ClassSessionSchema,
  IsoDateSchema,
  LevelExamSchema,
  PackPurchaseSchema,
  PracticeFeedbackSchema,
  SessionBookingSchema,
  SessionPackSchema,
  UtcDateTimeSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, ofTenant } from "../context";
import { mockDb } from "../db";
import { get, list, param } from "./route";

const COURSE = { module: "M41", permission: "m41.course.read" } as const;

function learnerFilter(tenantId: string, url: URL): string | null {
  const learnerId = param(url, "learnerId");
  if (learnerId !== null) {
    const exists = ofTenant(mockDb.learners, tenantId).some((row) => row.id === learnerId);
    if (!exists) throw new ApiFailure("not_found");
  }
  return learnerId;
}

function parseBoundary(url: URL, key: "from" | "to"): number | null {
  const value = param(url, key);
  if (value === null) return null;
  if (IsoDateSchema.safeParse(value).success) {
    return Date.parse(key === "from" ? `${value}T00:00:00Z` : `${value}T23:59:59.999Z`);
  }
  if (UtcDateTimeSchema.safeParse(value).success) {
    return Date.parse(value);
  }
  throw new ApiFailure("invalid_request", [
    { path: key, message: "must be YYYY-MM-DD or UTC ISO-8601" },
  ]);
}

export const m41Handlers = [
  get("/catalogue-courses", COURSE, (ctx) =>
    list(
      ctx,
      ofTenant(mockDb.catalogueCourses, ctx.viewer.tenantId),
      pageSchema(CatalogueCourseSchema),
    ),
  ),
  get("/session-packs", COURSE, (ctx) =>
    list(ctx, ofTenant(mockDb.sessionPacks, ctx.viewer.tenantId), pageSchema(SessionPackSchema)),
  ),
  get("/pack-purchases", COURSE, (ctx) => {
    const learnerId = learnerFilter(ctx.viewer.tenantId, ctx.url);
    const rows = ofTenant(mockDb.packPurchases, ctx.viewer.tenantId).filter(
      (row) => learnerId === null || row.learnerId === learnerId,
    );
    return list(ctx, rows, pageSchema(PackPurchaseSchema));
  }),
  get("/class-sessions", COURSE, (ctx) => {
    const fromMs = parseBoundary(ctx.url, "from");
    const toMs = parseBoundary(ctx.url, "to");
    if (fromMs !== null && toMs !== null && fromMs > toMs) {
      throw new ApiFailure("invalid_request", [{ path: "to", message: "must not be before from" }]);
    }
    const rows = ofTenant(mockDb.classSessions, ctx.viewer.tenantId).filter((row) => {
      const startMs = Date.parse(row.startsAt);
      return (fromMs === null || startMs >= fromMs) && (toMs === null || startMs <= toMs);
    });
    return list(ctx, rows, pageSchema(ClassSessionSchema));
  }),
  get("/session-bookings", COURSE, (ctx) => {
    const sessionId = param(ctx.url, "sessionId");
    if (sessionId !== null) {
      const exists = ofTenant(mockDb.classSessions, ctx.viewer.tenantId).some(
        (row) => row.id === sessionId,
      );
      if (!exists) throw new ApiFailure("not_found");
    }
    const rows = ofTenant(mockDb.sessionBookings, ctx.viewer.tenantId).filter(
      (row) => sessionId === null || row.sessionId === sessionId,
    );
    return list(ctx, rows, pageSchema(SessionBookingSchema));
  }),
  get("/level-exams", COURSE, (ctx) => {
    const learnerId = learnerFilter(ctx.viewer.tenantId, ctx.url);
    const rows = ofTenant(mockDb.levelExams, ctx.viewer.tenantId).filter(
      (row) => learnerId === null || row.learnerId === learnerId,
    );
    return list(ctx, rows, pageSchema(LevelExamSchema));
  }),
  get("/practice-feedback", COURSE, (ctx) => {
    const learnerId = learnerFilter(ctx.viewer.tenantId, ctx.url);
    const rows = ofTenant(mockDb.practiceFeedback, ctx.viewer.tenantId).filter(
      (row) => learnerId === null || row.learnerId === learnerId,
    );
    return list(ctx, rows, pageSchema(PracticeFeedbackSchema));
  }),
];
