import {
  LiveJoinSchema,
  LiveRecordingSchema,
  LiveSessionSchema,
  LiveSummarySchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { learningSpaceAccess } from "./m32";
import { found, get, list, ok, param } from "./route";

const M = { module: "M36", permission: "m36.live.read" } as const;

function liveAccess(viewer: Viewer) {
  const { tenantId, personId, permissions } = viewer;
  const { spaces, spaceById, manage } = learningSpaceAccess(viewer, "m36.live.host");
  const isAdmin = manage && permissions.has("m30.course.manage");
  const spaceIds = new Set(spaces.map((space) => space.id));
  const ownProfiles = ofTenant(mockDb.roleProfiles, tenantId).filter(
    (row) => row.personId === personId,
  );
  const ownProfileIds = new Set(ownProfiles.map((row) => row.id));
  const staffIds = new Set(ownProfiles.filter((r) => r.kind === "staff").map((r) => r.id));
  const sessions = ofTenant(mockDb.liveSessions, tenantId).filter((row) =>
    row.courseSpaceId === null ? isAdmin : spaceIds.has(row.courseSpaceId),
  );

  function sessionAccess(id: string | undefined) {
    const session = found(sessions.find((row) => row.id === id));
    const space = session.courseSpaceId === null ? null : spaceById(session.courseSpaceId);
    const staff =
      isAdmin ||
      (space !== null && space.staffProfileIds.some((pid) => staffIds.has(pid))) ||
      session.hostStaffProfileIds.some((pid) => staffIds.has(pid));
    return { session, staff, ownProfileIds };
  }

  return { sessions, spaceById, sessionAccess };
}

export const m36Handlers = [
  get("/live-sessions", M, (ctx) => {
    const { sessions, spaceById } = liveAccess(ctx.viewer);
    const courseSpaceId = param(ctx.url, "courseSpaceId");
    if (courseSpaceId !== null) spaceById(courseSpaceId);
    const rows = sessions.filter(
      (row) => courseSpaceId === null || row.courseSpaceId === courseSpaceId,
    );
    return list(ctx, rows, pageSchema(LiveSessionSchema));
  }),
  get("/live-sessions/:id", M, (ctx) =>
    ok(LiveSessionSchema, liveAccess(ctx.viewer).sessionAccess(ctx.params["id"]).session),
  ),
  get("/live-sessions/:id/joins", M, (ctx) => {
    const { session, staff, ownProfileIds } = liveAccess(ctx.viewer).sessionAccess(
      ctx.params["id"],
    );
    const rows = ofTenant(mockDb.liveJoins, ctx.viewer.tenantId).filter(
      (row) => row.sessionId === session.id && (staff || ownProfileIds.has(row.profileId)),
    );
    return list(ctx, rows, pageSchema(LiveJoinSchema));
  }),
  get("/live-sessions/:id/recordings", M, (ctx) => {
    const { session, staff } = liveAccess(ctx.viewer).sessionAccess(ctx.params["id"]);
    const rows = ofTenant(mockDb.liveRecordings, ctx.viewer.tenantId).filter(
      (row) =>
        row.sessionId === session.id &&
        (staff || (row.visibleToLearners && row.status === "ready")),
    );
    return list(ctx, rows, pageSchema(LiveRecordingSchema));
  }),
  get("/live-sessions/:id/summary", M, (ctx) => {
    const { session, staff } = liveAccess(ctx.viewer).sessionAccess(ctx.params["id"]);
    const summary = found(
      ofTenant(mockDb.liveSummaries, ctx.viewer.tenantId).find(
        (row) => row.sessionId === session.id && (staff || row.status === "published"),
      ),
    );
    return ok(LiveSummarySchema, summary);
  }),
];
