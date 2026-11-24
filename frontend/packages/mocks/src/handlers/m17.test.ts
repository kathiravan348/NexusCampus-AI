import {
  AttendanceMarkSchema,
  AttendanceRosterEntrySchema,
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

const rosterPath = `/attendance-sessions/${sessionId}/roster`;
const RosterPage = pageSchema(AttendanceRosterEntrySchema);
function postMark(
  body: unknown,
  key = crypto.randomUUID(),
  user: string = USER.lsArjun,
  path = marksPath,
) {
  return fetch(`http://localhost/api/v1${path}`, {
    method: "POST",
    headers: {
      [MOCK_HEADER.tenant]: tenantId,
      [MOCK_HEADER.user]: user,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
}

describe("Manual attendance handlers", () => {
  it("filters enrolments by inclusive dates, deduplicates and sorts the roster before paging", async () => {
    const session = mockDb.attendanceSessions.find((row) => row.id === sessionId)!;
    const base = mockDb.enrolments.find((row) => row.tenantId === tenantId)!;
    const learners = mockDb.learners.filter((row) => row.tenantId === tenantId);
    const rows = learners.slice(0, 2).map((learner, index) => ({
      ...base,
      learnerId: learner.id,
      classGroupId: session.classGroupId!,
      effectiveFrom: session.date,
      effectiveTo: session.date,
      rollNumber: String(2 - index),
    }));
    const first = rows[0]!;
    mockDb.enrolments = [
      ...mockDb.enrolments.filter((row) => row.tenantId !== tenantId),
      ...rows,
      first,
      { ...first, rollNumber: "0", effectiveTo: "2000-01-01" },
      { ...first, rollNumber: "0", effectiveFrom: "2099-01-01", effectiveTo: null },
    ];
    const page = RosterPage.parse(await (await get(`${rosterPath}?pageSize=1&page=2`)).json());
    expect(page.total).toBe(2);
    expect(page.items).toEqual([{ learnerId: first.learnerId, rollNumber: "2" }]);
    session.classGroupId = null;
    expect(RosterPage.parse(await (await get(rosterPath)).json()).items).toEqual([]);
  });

  it("appends corrections and returns one receipt for concurrent retries", async () => {
    const session = mockDb.attendanceSessions.find((row) => row.id === sessionId)!;
    session.status = "open";
    session.submittedAt = null;
    const roster = RosterPage.parse(await (await get(rosterPath)).json());
    const input = {
      learnerId: roster.items[0]!.learnerId,
      status: "late",
      minutesLate: 10,
      note: null,
    };
    const count = mockDb.attendanceMarks.length;
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([postMark(input, key), postMark(input, key)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const mark = AttendanceMarkSchema.parse(await a.json());
    expect(await b.json()).toEqual(mark);
    expect(mark).toMatchObject({ ...input, method: "manual", tenantId, sessionId });
    expect(mark.markedByStaffProfileId).toBeTruthy();
    expect(mockDb.attendanceMarks).toHaveLength(count + 1);
    expect((await postMark({ ...input, status: "present", minutesLate: null })).status).toBe(201);
    expect(mockDb.attendanceMarks).toHaveLength(count + 2);
    expect(mockDb.attendanceMarks[count]).toEqual(mark);
    session.status = "locked";
    expect(await (await postMark(input, key)).json()).toEqual(mark);
  });

  it("requires a currently effective staff profile even with mark permission", async () => {
    const profiles = mockDb.roleProfiles.filter(
      (row) => row.tenantId === tenantId && row.kind === "staff",
    );
    expect(profiles.length).toBeGreaterThan(0);
    for (const profile of profiles) profile.effectiveTo = "2000-01-01";
    expect((await postMark({})).status).toBe(403);
    for (const profile of profiles) {
      profile.effectiveTo = null;
      profile.effectiveFrom = "2099-01-01";
    }
    expect((await postMark({})).status).toBe(403);
  });

  it("enforces staff access, tenant scope, roster membership and session status", async () => {
    const session = mockDb.attendanceSessions.find((row) => row.id === sessionId)!;
    const input = {
      learnerId: "outside-roster",
      status: "absent",
      minutesLate: null,
      note: "private text",
    };
    const foreign = `/attendance-sessions/${attendanceSessionId("rv", 2)}`;
    expect((await get(rosterPath, USER.lsSunita)).status).toBe(403);
    expect((await postMark(input, undefined, USER.lsSunita)).status).toBe(403);
    expect((await get(`${foreign}/roster`)).status).toBe(404);
    expect((await postMark(input, undefined, USER.lsArjun, `${foreign}/marks`)).status).toBe(404);
    session.status = "locked";
    const closed = await postMark(input);
    expect(closed.status).toBe(409);
    expect(await closed.text()).toContain('"path":"status"');
    session.status = "open";
    const invalid = await postMark(input);
    expect(invalid.status).toBe(400);
    const detail = await invalid.text();
    expect(detail).toContain('"path":"learnerId"');
    expect(detail).not.toContain(input.learnerId);
    expect(detail).not.toContain(input.note);
    for (const role of mockDb.roles)
      role.permissions = role.permissions.filter((code) => code !== "m17.attendance.mark");
    expect((await postMark(input)).status).toBe(403);
  });
});
