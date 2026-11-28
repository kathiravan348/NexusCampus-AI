import {
  ProctoringFlagSchema,
  ProctoringSessionSchema,
  ProctoringSettingsSchema,
  RecordingSegmentSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { roleId, type SystemRoleKey } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

const tenant = TENANT.northbridge;

function adminOf(tenantId: string): string {
  return mockDb.users.find(
    (row) =>
      row.tenantId === tenantId &&
      permissionsOf(row.id).has("m34.proctoring.manage") &&
      permissionsOf(row.id).has("m34.flag.review"),
  )!.id;
}

function get(path: string, userId: string, tenantId: string = tenant) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function signInAs(userId: string, personId: string, role: SystemRoleKey) {
  const user = mockDb.users.find((row) => row.id === userId)!;
  user.personId = personId;
  const assignment = mockDb.roleAssignments.find((row) => row.userId === user.id)!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== user.id);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenant, role) });
}

function midterm() {
  const settings = mockDb.proctoringSettings.find((row) => row.tenantId === tenant)!;
  const sessions = mockDb.proctoringSessions.filter((row) => row.testId === settings.testId);
  const session = sessions[0]!;
  return {
    settings,
    sessions,
    session,
    settingsPath: `/online-tests/${settings.testId}/proctoring`,
    sessionPath: `/proctoring-sessions/${session.id}`,
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

describe("M34 read handlers", () => {
  it("serves settings, sessions, flags and recording metadata to an admin", async () => {
    const adminId = adminOf(tenant);
    const { settings, sessions, session, settingsPath, sessionPath } = midterm();
    expect(await parse(await get(settingsPath, adminId), ProctoringSettingsSchema)).toEqual(
      settings,
    );
    const listed = await parse(
      await get(`/proctoring-sessions?testId=${settings.testId}`, adminId),
      pageSchema(ProctoringSessionSchema),
    );
    expect(listed.items).toEqual(sessions);
    const flags = await parse(
      await get(`${sessionPath}/flags`, adminId),
      pageSchema(ProctoringFlagSchema),
    );
    expect(flags.total).toBe(3);
    expect(flags.items.every((row) => row.sessionId === session.id)).toBe(true);

    const recResponse = await get(`${sessionPath}/recordings`, adminId);
    expect(recResponse.status).toBe(200);
    const rawRecs = (await recResponse.json()) as { items: Record<string, unknown>[] };
    expect(rawRecs.items).toHaveLength(2);
    for (const item of rawRecs.items) {
      expect(item["deleteOn"]).toBe("2026-12-11");
      expect("url" in item).toBe(false);
      expect("storageKey" in item).toBe(false);
    }
    const recordings = pageSchema(RecordingSegmentSchema).parse(rawRecs);
    expect(recordings.items.every((row) => row.sessionId === session.id)).toBe(true);
  });

  it("allows a flag reviewer to read flags and recordings", async () => {
    const userId = adminOf(tenant);
    const { settings, sessionPath, settingsPath } = midterm();
    const staff = mockDb.roleProfiles.find(
      (row) => row.tenantId === tenant && row.kind === "staff",
    )!;
    signInAs(userId, staff.personId, "teacher");
    const teacherRole = mockDb.roles.find((row) => row.id === roleId(tenant, "teacher"))!;
    teacherRole.permissions.push("m34.flag.review");

    const sessionsPath = `/proctoring-sessions?testId=${settings.testId}`;
    expect((await get(settingsPath, userId)).status).toBe(403);
    expect((await get(sessionsPath, userId)).status).toBe(403);
    expect((await get(`${sessionPath}/flags`, userId)).status).toBe(200);
    expect((await get(`${sessionPath}/recordings`, userId)).status).toBe(200);
  });

  it("denies learners, guardians and users without M34 permissions", async () => {
    const userId = adminOf(tenant);
    const { settings, settingsPath, sessionPath } = midterm();
    const learner = mockDb.learners.find((row) => row.tenantId === tenant)!;
    const routes = [
      settingsPath,
      `/proctoring-sessions?testId=${settings.testId}`,
      `${sessionPath}/flags`,
      `${sessionPath}/recordings`,
    ];

    for (const role of ["learner", "guardian"] as const) {
      signInAs(userId, learner.personId, role);
      for (const route of routes) {
        const res = await get(route, userId);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
      }
    }

    resetMockDb();
    const uid = adminOf(tenant);
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== uid);
    for (const route of routes) {
      const res = await get(route, uid);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("returns 404 for another tenant's test and session IDs", async () => {
    const apexAdminId = adminOf(TENANT.apex);
    const { settings, settingsPath, sessionPath } = midterm();
    for (const route of [
      settingsPath,
      `/proctoring-sessions?testId=${settings.testId}`,
      `${sessionPath}/flags`,
      `${sessionPath}/recordings`,
    ]) {
      expect((await get(route, apexAdminId, TENANT.apex)).status).toBe(404);
    }
  });

  it("returns 403 module_disabled when M34 is not entitled (Riverside)", async () => {
    const { settings, settingsPath, sessionPath } = midterm();
    for (const route of [
      settingsPath,
      `/proctoring-sessions?testId=${settings.testId}`,
      `${sessionPath}/flags`,
      `${sessionPath}/recordings`,
    ]) {
      const res = await get(route, USER.rvHelen, TENANT.riverside);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "module_disabled" } });
    }
  });
});
