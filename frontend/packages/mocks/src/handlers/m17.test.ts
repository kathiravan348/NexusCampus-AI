import {
  AttendanceMarkSchema,
  AttendanceSessionSchema,
  LeaveRequestSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CLASS_GROUP, LEARNER, PERSON, TENANT, USER, attendanceSessionId } from "../fixtures";
import { server } from "../node";

const tenantId = TENANT.littleSteps;
const sessionId = attendanceSessionId("ls", 2);
const marksPath = `/attendance-sessions/${sessionId}/marks`;
const MarksPage = pageSchema(AttendanceMarkSchema);
const LeavePage = pageSchema(LeaveRequestSchema);

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(resetMockDb);
afterAll(() => server.close());

describe("M17 read handlers", () => {
  it("lets admins list sessions, marks, and leave requests in their tenant", async () => {
    const classGroupId = CLASS_GROUP.lsSeedlings;
    const sessions = await get(`/attendance-sessions?classGroupId=${classGroupId}`);
    expect(sessions.status).toBe(200);
    const { items } = pageSchema(AttendanceSessionSchema).parse(await sessions.json());
    expect(items).toHaveLength(5);
    const matchesClass = items.every(
      (row) => row.tenantId === tenantId && row.classGroupId === classGroupId,
    );
    expect(matchesClass).toBe(true);

    const marks = await get(marksPath);
    expect(marks.status).toBe(200);
    const expected = mockDb.attendanceMarks.filter(
      (row) => row.tenantId === tenantId && row.sessionId === sessionId,
    );
    expect(MarksPage.parse(await marks.json()).items).toEqual(expected);

    const leaves = await get("/leave-requests");
    expect(leaves.status).toBe(200);
    expect(LeavePage.parse(await leaves.json()).items).toEqual(
      mockDb.leaveRequests.filter((row) => row.tenantId === tenantId),
    );
  });

  it("shows teachers mark notes with mark permission and denies leave decisions", async () => {
    expect((await get("/attendance-sessions", USER.lsArjun)).status).toBe(200);
    const response = await get(marksPath, USER.lsArjun);
    expect(response.status).toBe(200);
    const { items } = MarksPage.parse(await response.json());
    expect(items.some((row) => row.note !== null)).toBe(true);
    expect((await get("/leave-requests", USER.lsArjun)).status).toBe(403);

    for (const role of mockDb.roles) {
      role.permissions = role.permissions.filter((code) => code !== "m17.attendance.mark");
    }
    const masked = await get(marksPath, USER.lsArjun);
    expect(masked.status).toBe(200);
    expect(MarksPage.parse(await masked.json()).items).toEqual(
      items.map((row) => ({ ...row, note: null })),
    );
  });

  it("lets a guardian read only family marks and leave requests", async () => {
    const ownMark = mockDb.attendanceMarks.find(
      (row) => row.sessionId === sessionId && row.learnerId === LEARNER.lsIshaan,
    )!;
    ownMark.note = "Example private note";
    const ownLeave = mockDb.leaveRequests.find((row) => row.tenantId === tenantId)!;
    ownLeave.learnerId = LEARNER.lsIshaan;
    ownLeave.requestedByPersonId = PERSON.lsSunita;
    const response = await get(marksPath, USER.lsSunita);
    expect(response.status).toBe(200);
    expect(MarksPage.parse(await response.json()).items).toEqual([{ ...ownMark, note: null }]);

    const leaves = await get("/leave-requests", USER.lsSunita);
    expect(leaves.status).toBe(200);
    expect(LeavePage.parse(await leaves.json()).items).toEqual([ownLeave]);

    expect((await get("/attendance-sessions", USER.lsSunita)).status).toBe(403);
  });

  it.each([
    `/attendance-sessions/${attendanceSessionId("rv", 2)}/marks`,
    `/attendance-sessions?classGroupId=${CLASS_GROUP.rvNorthYearTen}`,
  ])("returns 404 for a foreign id at %s", async (path) => {
    expect((await get(path)).status).toBe(404);
  });

  it.each(["/attendance-sessions", marksPath, "/leave-requests"])(
    "denies a viewer without permission or family access at %s",
    async (path) => {
      const { roleAssignments } = mockDb;
      mockDb.roleAssignments = roleAssignments.filter((row) => row.userId !== USER.lsPriya);
      expect((await get(path)).status).toBe(403);
    },
  );
});
