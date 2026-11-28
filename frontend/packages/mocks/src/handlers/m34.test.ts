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

const tenant: string = TENANT.northbridge;

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

function patch(path: string, body: unknown, userId: string, key?: string, tenantId = tenant) {
  return fetch(`http://localhost/api/v1${path}`, {
    method: "PATCH",
    headers: {
      [MOCK_HEADER.tenant]: tenantId,
      [MOCK_HEADER.user]: userId,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
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

function staffViewer(role: "manager" | "reviewer" = "manager") {
  const userId = adminOf(tenant);
  const staff = mockDb.roleProfiles.find(
    (row) => row.tenantId === tenant && row.kind === "staff" && row.status === "active",
  )!;
  if (role === "reviewer") {
    signInAs(userId, staff.personId, "teacher");
    const teacher = mockDb.roles.find((row) => row.id === roleId(tenant, "teacher"))!;
    teacher.permissions.push("m34.flag.review");
  } else {
    mockDb.users.find((row) => row.id === userId)!.personId = staff.personId;
  }
  return { userId, staff };
}

function pendingFlag() {
  const flag = mockDb.proctoringFlags.find(
    (row) => row.tenantId === tenant && row.review === "pending",
  )!;
  return { flag, path: `/proctoring-flags/${flag.id}/review` };
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
    const { userId } = staffViewer("reviewer");
    const { settings, sessionPath, settingsPath } = midterm();

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

describe("M34 flag reviews", () => {
  it("stores a dismissal by a flag reviewer and replays only its key", async () => {
    const { userId, staff } = staffViewer("reviewer");
    const { flag, path } = pendingFlag();
    const body = { review: "dismissed", note: null };
    const before = Date.now();
    const saved = await parse(await patch(path, body, userId, "dismiss"), ProctoringFlagSchema);
    expect(saved.reviewNote).toBeNull();
    expect(saved).toMatchObject({ review: "dismissed", reviewedByStaffProfileId: staff.id });
    expect(Date.parse(saved.reviewedAt!)).toBeGreaterThanOrEqual(before);
    expect(mockDb.proctoringFlags.find((row) => row.id === flag.id)).toEqual(saved);
    const replay = await parse(await patch(path, body, userId, "dismiss"), ProctoringFlagSchema);
    expect(replay).toEqual(saved);
    const conflict = await patch(path, body, userId, "different");
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "conflict" } });
  });

  it("rejects missing keys and invalid bodies without exposing note text", async () => {
    const { userId } = staffViewer();
    const { flag, path } = pendingFlag();
    expect((await patch(path, { review: "dismissed", note: null }, userId)).status).toBe(400);
    const missing = await patch(path, { review: "upheld", note: null }, userId, "missing-note");
    expect(missing.status).toBe(422);
    expect(await missing.json()).toMatchObject({ error: { details: [{ path: "note" }] } });
    const note = "Private example note";
    const body = { review: "upheld", note: note.repeat(100) };
    const oversized = await patch(path, body, userId, "long-note");
    expect(oversized.status).toBe(422);
    expect(await oversized.text()).not.toContain(note);
    expect(mockDb.proctoringFlags.find((row) => row.id === flag.id)).toEqual(flag);
  });

  it("denies cross-tenant and unauthorized reviews", async () => {
    const { userId, staff } = staffViewer();
    const { path } = pendingFlag();
    const body = { review: "dismissed", note: null };
    const outside = await patch(path, body, adminOf(TENANT.apex), "outside", TENANT.apex);
    expect(outside.status).toBe(404);
    staff.effectiveTo = "2000-01-01";
    expect((await patch(path, body, userId, "inactive")).status).toBe(403);
    signInAs(userId, staff.personId, "learner");
    expect((await patch(path, body, userId, "forbidden")).status).toBe(403);
  });

  it("upholds a flag without changing attempts or responses", async () => {
    const { userId } = staffViewer();
    const { path } = pendingFlag();
    const attempts = structuredClone(mockDb.testAttempts);
    const responses = structuredClone(mockDb.testResponses);
    const body = { review: "upheld", note: "  Reviewed with the invigilator  " };
    const saved = await parse(await patch(path, body, userId, "uphold"), ProctoringFlagSchema);
    expect(saved).toMatchObject({ review: "upheld", reviewNote: "Reviewed with the invigilator" });
    expect(mockDb.testAttempts).toEqual(attempts);
    expect(mockDb.testResponses).toEqual(responses);
  });
});

describe("M34 identity decisions", () => {
  function pendingSession() {
    const { session, sessionPath, settings } = midterm();
    session.identityResult = "pending";
    session.identityCheckedByStaffProfileId = null;
    session.identityCheckedAt = null;
    return { session, settings, path: sessionPath + "/identity" };
  }

  it("stores a staff decision and returns it on replay", async () => {
    const { userId, staff } = staffViewer();
    const { session, path } = pendingSession();
    const body = { result: "verified" };
    const before = Date.now();
    const saved = await parse(await patch(path, body, userId, "verify"), ProctoringSessionSchema);
    expect(saved).toMatchObject({
      id: session.id,
      identityResult: "verified",
      identityCheckedByStaffProfileId: staff.id,
    });
    expect(Date.parse(saved.identityCheckedAt!)).toBeGreaterThanOrEqual(before);
    expect(mockDb.proctoringSessions.find((row) => row.id === session.id)).toEqual(saved);
    const replay = await parse(await patch(path, body, userId, "verify"), ProctoringSessionSchema);
    expect(replay).toEqual(saved);
    expect((await patch(path, body, userId, "verify-again")).status).toBe(409);
  });

  it("rejects identity decisions without a configured check or manage permission", async () => {
    const { userId } = staffViewer("reviewer");
    const { path } = pendingSession();
    const body = { result: "not_verified" };
    expect((await patch(path, body, userId, "reviewer-only")).status).toBe(403);
    resetMockDb();
    const manager = staffViewer();
    const { settings } = pendingSession();
    settings.identityCheck = "none";
    expect((await patch(path, body, manager.userId, "no-check")).status).toBe(409);
  });
});
