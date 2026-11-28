import {
  LearningPathSchema,
  MasteryRecordSchema,
  TutorMessageSchema,
  TutorSessionSchema,
  TutorSettingsSchema,
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
  const mastery = mockDb.masteryRecords.filter((row) => row.tenantId === tenant);
  const path = mockDb.learningPaths.find((row) => row.tenantId === tenant)!;
  const miaMastery = mastery.find((row) => row.learnerId === path.learnerId)!;
  const ellaMastery = mastery.find((row) => row.learnerId !== path.learnerId)!;
  const settings = mockDb.tutorSettings.find((row) => row.courseSpaceId === path.courseSpaceId)!;
  const session = mockDb.tutorSessions.find((row) => row.courseSpaceId === path.courseSpaceId)!;
  const miaSpace = mockDb.courseSpaces.find((row) => row.id === path.courseSpaceId)!;
  const ellaModule = mockDb.courseModules.find(
    (row) => row.tenantId === tenant && row.outcomeIds.includes(ellaMastery.outcomeId),
  )!;
  const ellaSpace = mockDb.courseSpaces.find((row) => row.id === ellaModule.courseSpaceId)!;
  return { mastery, path, miaMastery, ellaMastery, settings, session, miaSpace, ellaSpace };
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

describe("M35 read handlers", () => {
  it("serves all M35 endpoints to an admin", async () => {
    const { mastery, path, miaMastery, settings, session, miaSpace } = riverside();
    const allMastery = await parse(await get("/mastery"), pageSchema(MasteryRecordSchema));
    expect(allMastery.items).toEqual(mastery);
    const byLearner = await parse(
      await get(`/mastery?learnerId=${miaMastery.learnerId}`),
      pageSchema(MasteryRecordSchema),
    );
    expect(byLearner.items).toEqual([miaMastery]);
    const bySpace = await parse(
      await get(`/mastery?courseSpaceId=${miaSpace.id}`),
      pageSchema(MasteryRecordSchema),
    );
    expect(bySpace.items).toEqual([miaMastery]);

    const paths = await parse(
      await get(`/learning-paths?learnerId=${path.learnerId}`),
      pageSchema(LearningPathSchema),
    );
    expect(paths.items).toEqual([path]);
    const tutor = await parse(
      await get(`/course-spaces/${miaSpace.id}/tutor`),
      TutorSettingsSchema,
    );
    expect(tutor).toEqual(settings);
    const sessions = await parse(
      await get(`/tutor-sessions?courseSpaceId=${miaSpace.id}`),
      pageSchema(TutorSessionSchema),
    );
    expect(sessions.items).toEqual([session]);
    const messages = await parse(
      await get(`/tutor-sessions/${session.id}/messages`),
      pageSchema(TutorMessageSchema),
    );
    expect(messages.total).toBe(2);
    expect(messages.items[1]?.role).toBe("tutor");
  });

  it("limits a teacher to own spaces and denies tutor settings and transcripts", async () => {
    const { path, miaMastery, ellaMastery, session, miaSpace, ellaSpace } = riverside();
    const staff = mockDb.roleProfiles.find(
      (row) =>
        row.tenantId === tenant &&
        row.kind === "staff" &&
        miaSpace.staffProfileIds.includes(row.id) &&
        !ellaSpace.staffProfileIds.includes(row.id),
    )!;
    mockDb.learningPaths.push({
      ...path,
      id: "lpa-rv-ella",
      learnerId: ellaMastery.learnerId,
      courseSpaceId: ellaSpace.id,
    });
    signInAs(staff.personId, "teacher");

    const mastery = await parse(await get("/mastery"), pageSchema(MasteryRecordSchema));
    expect(mastery.items).toEqual([miaMastery]);
    const bySpace = await parse(
      await get(`/mastery?courseSpaceId=${miaSpace.id}`),
      pageSchema(MasteryRecordSchema),
    );
    expect(bySpace.items).toEqual([miaMastery]);
    expect((await get(`/mastery?courseSpaceId=${ellaSpace.id}`)).status).toBe(404);
    expect((await get(`/mastery?learnerId=${ellaMastery.learnerId}`)).status).toBe(404);

    const paths = await parse(await get("/learning-paths"), pageSchema(LearningPathSchema));
    expect(paths.items).toEqual([path]);
    expect((await get(`/learning-paths?learnerId=${ellaMastery.learnerId}`)).status).toBe(404);

    for (const route of [
      `/course-spaces/${miaSpace.id}/tutor`,
      "/tutor-sessions",
      `/tutor-sessions/${session.id}/messages`,
    ]) {
      const res = await get(route);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("scopes transcripts to staff spaces and enforces transcript visibility", async () => {
    const { ellaMastery, session, miaSpace, ellaSpace } = riverside();
    const nbSession = mockDb.tutorSessions.find((row) => row.tenantId === TENANT.northbridge)!;
    const nbAdmin = mockDb.users.find(
      (row) =>
        row.tenantId === TENANT.northbridge && permissionsOf(row.id).has("m35.transcript.read"),
    )!;
    const flaggedMessages = await parse(
      await get(`/tutor-sessions/${nbSession.id}/messages`, nbAdmin.id, TENANT.northbridge),
      pageSchema(TutorMessageSchema),
    );
    expect(flaggedMessages.total).toBe(4);

    session.transcriptsVisibleToStaff = false;
    const hidden = await get(`/tutor-sessions/${session.id}/messages`);
    expect(hidden.status).toBe(403);
    expect(await hidden.json()).toMatchObject({ error: { code: "forbidden" } });

    session.transcriptsVisibleToStaff = true;
    const ellaSession = {
      ...session,
      id: "tse-rv-ella",
      learnerId: ellaMastery.learnerId,
      courseSpaceId: ellaSpace.id,
    };
    mockDb.tutorSessions.push(ellaSession);
    const staff = mockDb.roleProfiles.find(
      (row) =>
        row.tenantId === tenant &&
        row.kind === "staff" &&
        miaSpace.staffProfileIds.includes(row.id) &&
        !ellaSpace.staffProfileIds.includes(row.id),
    )!;
    signInAs(staff.personId, "teacher");
    const teacherRole = mockDb.roles.find((row) => row.id === roleId(tenant, "teacher"))!;
    teacherRole.permissions.push("m35.transcript.read");

    const sessions = await parse(await get("/tutor-sessions"), pageSchema(TutorSessionSchema));
    expect(sessions.items).toEqual([session]);
    expect((await get(`/tutor-sessions?courseSpaceId=${ellaSpace.id}`)).status).toBe(404);
    const ownMessages = await parse(
      await get(`/tutor-sessions/${session.id}/messages`),
      pageSchema(TutorMessageSchema),
    );
    expect(ownMessages.total).toBe(2);
    expect((await get(`/tutor-sessions/${ellaSession.id}/messages`)).status).toBe(404);
  });

  it("denies learners and guardians on every M35 endpoint", async () => {
    const { miaMastery, session, miaSpace } = riverside();
    const learner = mockDb.learners.find((row) => row.id === miaMastery.learnerId)!;
    const routes = [
      "/mastery",
      "/learning-paths",
      `/course-spaces/${miaSpace.id}/tutor`,
      "/tutor-sessions",
      `/tutor-sessions/${session.id}/messages`,
    ];
    for (const role of ["learner", "guardian"] as const) {
      signInAs(learner.personId, role);
      for (const route of routes) {
        const res = await get(route);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
      }
    }
  });

  it("returns 404 for foreign learner, course space and session IDs", async () => {
    const { path, miaMastery, session, miaSpace } = riverside();
    for (const route of [
      `/mastery?learnerId=${miaMastery.learnerId}`,
      `/mastery?courseSpaceId=${miaSpace.id}`,
      `/learning-paths?learnerId=${path.learnerId}`,
      `/course-spaces/${miaSpace.id}/tutor`,
      `/tutor-sessions?courseSpaceId=${miaSpace.id}`,
      `/tutor-sessions/${session.id}/messages`,
    ]) {
      expect((await get(route, USER.lsPriya, TENANT.littleSteps)).status).toBe(404);
    }
  });

  it("requires M35 permissions and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    const forbidden = await get("/mastery");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M35",
    );
    const disabled = await get("/mastery");
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
