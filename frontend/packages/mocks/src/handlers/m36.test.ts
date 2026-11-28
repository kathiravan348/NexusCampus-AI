import {
  LiveJoinSchema,
  LiveRecordingSchema,
  LiveSessionSchema,
  LiveSummarySchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { roleId, type SystemRoleKey } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

const tenant = TENANT.riverside;

function get(path: string, userId: string = USER.rvHelen, tenantId: string = tenant) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function signInAs(personId: string, role: SystemRoleKey) {
  const user = mockDb.users.find((row) => row.id === USER.rvHelen)!;
  user.personId = personId;
  const assignment = mockDb.roleAssignments.find((row) => row.userId === user.id)!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== user.id);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenant, role) });
}

function riverside() {
  const sessions = mockDb.liveSessions.filter((row) => row.tenantId === tenant);
  const summary = mockDb.liveSummaries.find((row) => row.tenantId === tenant)!;
  const mathSession = sessions.find((row) => row.id === summary.sessionId)!;
  const deletedRec = mockDb.liveRecordings.find(
    (row) => row.tenantId === tenant && row.status === "deleted",
  )!;
  const engSession = sessions.find((row) => row.id === deletedRec.sessionId)!;
  const y9Session = sessions.find((row) => row.status === "live")!;
  const readyRec = mockDb.liveRecordings.find((row) => row.sessionId === mathSession.id)!;
  const mathJoins = mockDb.liveJoins.filter((row) => row.sessionId === mathSession.id);
  const miaJoin = mathJoins.find((row) => row.role === "participant")!;
  const hostJoin = mathJoins.find((row) => row.role === "host")!;
  return {
    sessions,
    summary,
    mathSession,
    engSession,
    y9Session,
    readyRec,
    deletedRec,
    mathJoins,
    miaJoin,
    hostJoin,
  };
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  expect(response.status).toBe(200);
  return schema.parse(await response.json());
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M36 read handlers", () => {
  it("serves all M36 endpoints and draft summaries to an admin", async () => {
    const { sessions, summary, mathSession, engSession, readyRec, deletedRec, mathJoins } =
      riverside();
    const all = await parse(await get("/live-sessions"), pageSchema(LiveSessionSchema));
    expect(all.items).toEqual(sessions);

    const bySpace = await parse(
      await get(`/live-sessions?courseSpaceId=${mathSession.courseSpaceId}`),
      pageSchema(LiveSessionSchema),
    );
    expect(bySpace.items).toEqual(
      sessions.filter((row) => row.courseSpaceId === mathSession.courseSpaceId),
    );
    expect(await parse(await get(`/live-sessions/${mathSession.id}`), LiveSessionSchema)).toEqual(
      mathSession,
    );

    const joins = await parse(
      await get(`/live-sessions/${mathSession.id}/joins`),
      pageSchema(LiveJoinSchema),
    );
    expect(joins.items).toEqual(mathJoins);

    const readyRecordings = await parse(
      await get(`/live-sessions/${mathSession.id}/recordings`),
      pageSchema(LiveRecordingSchema),
    );
    expect(readyRecordings.items).toEqual([readyRec]);

    const deletedRecordings = await parse(
      await get(`/live-sessions/${engSession.id}/recordings`),
      pageSchema(LiveRecordingSchema),
    );
    expect(deletedRecordings.items).toEqual([deletedRec]);

    const published = await parse(
      await get(`/live-sessions/${mathSession.id}/summary`),
      LiveSummarySchema,
    );
    expect(published).toEqual(summary);

    const nbDraft = mockDb.liveSummaries.find(
      (row) => row.tenantId === TENANT.northbridge && row.status === "draft",
    )!;
    const nbAdmin = mockDb.users.find(
      (row) =>
        row.tenantId === TENANT.northbridge && permissionsOf(row.id).has("m30.course.manage"),
    )!;
    const draft = await parse(
      await get(`/live-sessions/${nbDraft.sessionId}/summary`, nbAdmin.id, TENANT.northbridge),
      LiveSummarySchema,
    );
    expect(draft).toEqual(nbDraft);
  });

  it("restricts space-less sessions to admin and lets space staff see drafts", async () => {
    const { summary, mathSession, engSession, deletedRec, mathJoins, hostJoin } = riverside();
    const adHoc = { ...mathSession, id: "lvs-rv-adhoc", courseSpaceId: null };
    mockDb.liveSessions.push(adHoc);
    const engDraft = {
      ...summary,
      id: "lsm-rv-eng-draft",
      sessionId: engSession.id,
      recordingId: deletedRec.id,
      status: "draft" as const,
      publishedByStaffProfileId: null,
      publishedAt: null,
    };
    mockDb.liveSummaries.push(engDraft);

    expect(await parse(await get(`/live-sessions/${adHoc.id}`), LiveSessionSchema)).toEqual(adHoc);

    const staff = mockDb.roleProfiles.find((row) => row.id === hostJoin.profileId)!;
    signInAs(staff.personId, "owner");
    expect(await parse(await get(`/live-sessions/${adHoc.id}`), LiveSessionSchema)).toEqual(adHoc);

    signInAs(staff.personId, "teacher");

    const teacherSessions = await parse(await get("/live-sessions"), pageSchema(LiveSessionSchema));
    expect(teacherSessions.items.some((row) => row.id === adHoc.id)).toBe(false);
    expect((await get(`/live-sessions/${adHoc.id}`)).status).toBe(404);

    const joins = await parse(
      await get(`/live-sessions/${mathSession.id}/joins`),
      pageSchema(LiveJoinSchema),
    );
    expect(joins.items).toEqual(mathJoins);
    const recs = await parse(
      await get(`/live-sessions/${engSession.id}/recordings`),
      pageSchema(LiveRecordingSchema),
    );
    expect(recs.items).toEqual([deletedRec]);
    expect(
      await parse(await get(`/live-sessions/${engSession.id}/summary`), LiveSummarySchema),
    ).toEqual(engDraft);
  });

  it("limits learners to own joins, ready recordings and published summaries", async () => {
    const { summary, mathSession, engSession, y9Session, readyRec, deletedRec, miaJoin } =
      riverside();
    const adHoc = { ...mathSession, id: "lvs-rv-adhoc", courseSpaceId: null };
    mockDb.liveSessions.push(adHoc);
    mockDb.liveRecordings.push(
      { ...readyRec, id: "lvr-rv-hidden", visibleToLearners: false },
      { ...readyRec, id: "lvr-rv-processing", status: "processing", visibleToLearners: true },
    );
    mockDb.liveSummaries.push({
      ...summary,
      id: "lsm-rv-eng-draft",
      sessionId: engSession.id,
      recordingId: deletedRec.id,
      status: "draft",
      publishedByStaffProfileId: null,
      publishedAt: null,
    });

    const miaProfile = mockDb.roleProfiles.find((row) => row.id === miaJoin.profileId)!;
    signInAs(miaProfile.personId, "learner");

    const sessions = await parse(await get("/live-sessions"), pageSchema(LiveSessionSchema));
    expect(sessions.items.map((row) => row.id)).toContain(mathSession.id);
    expect(sessions.items.some((row) => row.id === y9Session.id || row.id === adHoc.id)).toBe(
      false,
    );
    expect((await get(`/live-sessions/${y9Session.id}`)).status).toBe(404);
    expect((await get(`/live-sessions/${adHoc.id}`)).status).toBe(404);
    expect((await get(`/live-sessions?courseSpaceId=${y9Session.courseSpaceId}`)).status).toBe(404);

    const joins = await parse(
      await get(`/live-sessions/${mathSession.id}/joins`),
      pageSchema(LiveJoinSchema),
    );
    expect(joins.items).toEqual([miaJoin]);

    const mathRecs = await parse(
      await get(`/live-sessions/${mathSession.id}/recordings`),
      pageSchema(LiveRecordingSchema),
    );
    expect(mathRecs.items).toEqual([readyRec]);

    const engRecs = await parse(
      await get(`/live-sessions/${engSession.id}/recordings`),
      pageSchema(LiveRecordingSchema),
    );
    expect(engRecs.items).toEqual([]);

    expect(
      await parse(await get(`/live-sessions/${mathSession.id}/summary`), LiveSummarySchema),
    ).toEqual(summary);
    expect((await get(`/live-sessions/${engSession.id}/summary`)).status).toBe(404);
  });

  it("denies guardians on every M36 endpoint", async () => {
    const { mathSession, miaJoin } = riverside();
    const miaProfile = mockDb.roleProfiles.find((row) => row.id === miaJoin.profileId)!;
    signInAs(miaProfile.personId, "guardian");
    for (const route of [
      "/live-sessions",
      `/live-sessions/${mathSession.id}`,
      `/live-sessions/${mathSession.id}/joins`,
      `/live-sessions/${mathSession.id}/recordings`,
      `/live-sessions/${mathSession.id}/summary`,
    ]) {
      const res = await get(route);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("returns 404 for foreign course space and session IDs", async () => {
    const { mathSession } = riverside();
    for (const route of [
      `/live-sessions?courseSpaceId=${mathSession.courseSpaceId}`,
      `/live-sessions/${mathSession.id}`,
      `/live-sessions/${mathSession.id}/joins`,
      `/live-sessions/${mathSession.id}/recordings`,
      `/live-sessions/${mathSession.id}/summary`,
    ]) {
      expect((await get(route, USER.lsPriya, TENANT.littleSteps)).status).toBe(404);
    }
  });

  it("requires M36 permission and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    const forbidden = await get("/live-sessions");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M36",
    );
    const disabled = await get("/live-sessions");
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
