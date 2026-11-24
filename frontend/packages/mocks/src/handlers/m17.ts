import {
  AttendanceMarkSchema,
  AttendanceSessionSchema,
  LeaveRequestSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, familyOf, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, param } from "./route";

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
