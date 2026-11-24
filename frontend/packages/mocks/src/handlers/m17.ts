import {
  AttendanceMarkInputSchema,
  AttendanceMarkSchema,
  AttendanceRosterEntrySchema,
  AttendanceSessionSchema,
  LeaveRequestSchema,
  pageSchema,
  type AttendanceSession,
} from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import {
  ApiFailure,
  entitled,
  failureResponse,
  familyOf,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, found, get, list, param } from "./route";

const M = { module: "M17" } as const;
const READ = "m17.attendance.read";
const MARK = "m17.attendance.mark";
const DECIDE = "m17.leave.decide";

function isStaff(viewer: Viewer): boolean {
  return ofTenant(mockDb.roleProfiles, viewer.tenantId).some(
    (row) => row.kind === "staff" && row.personId === viewer.personId,
  );
}

function familyLearners(viewer: Viewer): Set<string> {
  const family = familyOf(viewer);
  const learners = new Set(
    ofTenant(mockDb.learners, viewer.tenantId)
      .filter((row) => family.has(row.personId))
      .map((row) => row.id),
  );
  if (learners.size === 0) throw new ApiFailure("forbidden");
  return learners;
}

function sessionFor(viewer: Viewer, id: unknown) {
  return found(ofTenant(mockDb.attendanceSessions, viewer.tenantId).find((row) => row.id === id));
}

function rosterFor(session: AttendanceSession) {
  if (!session.classGroupId) return [];
  const learners = new Set(ofTenant(mockDb.learners, session.tenantId).map((row) => row.id));
  const placements = ofTenant(mockDb.enrolments, session.tenantId)
    .filter(
      (row) =>
        learners.has(row.learnerId) &&
        row.classGroupId === session.classGroupId &&
        row.effectiveFrom <= session.date &&
        (row.effectiveTo === null || row.effectiveTo >= session.date),
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

const receipts = new Map<string, string>();

export const m17Handlers = [
  get("/attendance-sessions", { ...M, permission: READ }, (ctx) => {
    if (!isStaff(ctx.viewer)) throw new ApiFailure("forbidden");
    const { tenantId } = ctx.viewer;
    const classGroupId = param(ctx.url, "classGroupId");
    if (classGroupId !== null) {
      found(ofTenant(mockDb.classGroups, tenantId).find((row) => row.id === classGroupId));
    }
    const sessions = ofTenant(mockDb.attendanceSessions, tenantId).filter(
      (row) => classGroupId === null || row.classGroupId === classGroupId,
    );
    return list(ctx, sessions, pageSchema(AttendanceSessionSchema));
  }),
  get("/attendance-sessions/:id/marks", M, (ctx) => {
    const { viewer } = ctx;
    const canReadAll = viewer.permissions.has(READ) && isStaff(viewer);
    const family = canReadAll ? null : familyLearners(viewer);
    const sessions = ofTenant(mockDb.attendanceSessions, viewer.tenantId);
    const session = found(sessions.find((row) => row.id === ctx.params["id"]));
    const showNote = viewer.permissions.has(MARK);
    const marks = ofTenant(mockDb.attendanceMarks, viewer.tenantId)
      .filter(
        (row) => row.sessionId === session.id && (family === null || family.has(row.learnerId)),
      )
      .map((row) => (showNote ? row : { ...row, note: null }));
    return list(ctx, marks, pageSchema(AttendanceMarkSchema));
  }),
  get("/attendance-sessions/:id/roster", { ...M, permission: READ }, (ctx) => {
    if (!isStaff(ctx.viewer)) throw new ApiFailure("forbidden");
    return list(
      ctx,
      rosterFor(sessionFor(ctx.viewer, ctx.params["id"])),
      pageSchema(AttendanceRosterEntrySchema),
    );
  }),
  http.post(`*${API_BASE}/attendance-sessions/:id/marks`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      const { tenantId } = viewer;
      if (!entitled(tenantId, "M17")) throw new ApiFailure("module_disabled");
      if (!viewer.permissions.has(MARK)) throw new ApiFailure("forbidden");
      const today = new Date().toISOString().slice(0, 10);
      const staff = ofTenant(mockDb.roleProfiles, tenantId).find(
        (row) =>
          row.kind === "staff" &&
          row.personId === viewer.personId &&
          (!("status" in row) || row.status === "active") &&
          row.effectiveFrom <= today &&
          (row.effectiveTo === null || row.effectiveTo >= today),
      );
      if (!staff) throw new ApiFailure("forbidden");
      const session = sessionFor(viewer, params["id"]);
      const key = request.headers.get("Idempotency-Key");
      const receipt = key ? JSON.stringify([tenantId, key]) : null;
      const raw: unknown = await request.json().catch(() => undefined);
      // No await between looking up the receipt and appending the mark.
      const previousId = receipt && receipts.get(receipt);
      if (previousId) {
        const previous = mockDb.attendanceMarks.find(
          (row) => row.id === previousId && row.tenantId === tenantId,
        );
        if (previous) return HttpResponse.json(previous, { status: 201 });
      }
      if (session.status !== "open") {
        throw new ApiFailure("conflict", [{ path: "status", message: "Session is closed" }]);
      }
      const parsed = AttendanceMarkInputSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((issue) => ({
            path: String(issue.path[0] ?? ""),
            message: "Invalid attendance mark",
          })),
        );
      }
      if (!rosterFor(session).some((row) => row.learnerId === parsed.data.learnerId)) {
        throw new ApiFailure("invalid_request", [
          { path: "learnerId", message: "Outside the session roster" },
        ]);
      }
      const mark = AttendanceMarkSchema.parse({
        ...parsed.data,
        id: crypto.randomUUID(),
        tenantId,
        sessionId: session.id,
        method: "manual",
        markedAt: new Date().toISOString(),
        markedByStaffProfileId: staff.id,
        deviceId: null,
      });
      mockDb.attendanceMarks.push(mark);
      if (receipt) receipts.set(receipt, mark.id);
      return HttpResponse.json(mark, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
  get("/leave-requests", M, (ctx) => {
    const { viewer } = ctx;
    const canDecide = viewer.permissions.has(DECIDE);
    // Staff need decision permission even if they also have a family link.
    if (!canDecide && isStaff(viewer)) throw new ApiFailure("forbidden");
    const family = canDecide ? null : familyLearners(viewer);
    const requests = ofTenant(mockDb.leaveRequests, viewer.tenantId).filter(
      (row) => family === null || family.has(row.learnerId),
    );
    return list(ctx, requests, pageSchema(LeaveRequestSchema));
  }),
];
