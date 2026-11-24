import {
  BellScheduleSchema,
  RoomSchema,
  TeacherLoadSchema,
  TimetableSlotSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CALENDAR, CLASS_GROUP, LEARNER, TENANT, USER } from "../fixtures";
import { server } from "../node";

const tenantId = TENANT.littleSteps;
const SlotsPage = pageSchema(TimetableSlotSchema);
const LoadPage = pageSchema(TeacherLoadSchema);

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(resetMockDb);
afterAll(() => server.close());

describe("M16 read handlers", () => {
  it.each([
    ["/rooms", pageSchema(RoomSchema), 2],
    ["/bell-schedules", pageSchema(BellScheduleSchema), 1],
    ["/timetable-slots", SlotsPage, 6],
  ] as const)("lets admins read tenant data at %s", async (path, schema, count) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    const { items } = schema.parse(await response.json());
    expect(items).toHaveLength(count);
    expect(items.every((row) => row.tenantId === tenantId)).toBe(true);
  });

  it("filters teacher timetable slots by class group and staff profile", async () => {
    const classGroupId = CLASS_GROUP.lsExplorer;
    const classPath = `/timetable-slots?classGroupId=${classGroupId}`;
    const offeringIds = mockDb.subjectOfferings
      .filter((row) => row.tenantId === tenantId && row.classGroupId === classGroupId)
      .map((row) => row.id);
    const expected = mockDb.timetableSlots.filter((row) =>
      offeringIds.includes(row.subjectOfferingId),
    );
    const response = await get(classPath, USER.lsArjun);
    expect(response.status).toBe(200);
    expect(SlotsPage.parse(await response.json()).items).toEqual(expected);

    const staffProfileId = expected.flatMap((row) => row.staffProfileIds)[0];
    expect(staffProfileId).toBeDefined();
    const filtered = await get(`${classPath}&staffProfileId=${staffProfileId}`, USER.lsArjun);
    expect(filtered.status).toBe(200);
    expect(SlotsPage.parse(await filtered.json()).items).toEqual(
      expected.filter((row) => row.staffProfileIds.some((id) => id === staffProfileId)),
    );
  });

  it("limits a guardian to class groups with an active family enrolment", async () => {
    const enrolment = mockDb.enrolments.find((row) => row.learnerId === LEARNER.lsRohan)!;
    enrolment.status = "completed";
    enrolment.effectiveTo = enrolment.effectiveFrom;
    const response = await get("/timetable-slots", USER.lsSunita);
    expect(response.status).toBe(200);
    const { items } = SlotsPage.parse(await response.json());
    const offerings = mockDb.subjectOfferings.filter(
      (row) => row.classGroupId === CLASS_GROUP.lsSeedlings,
    );
    expect(items).toHaveLength(3);
    const offeringIds = offerings.map((row) => row.id);
    expect(items.every((row) => offeringIds.includes(row.subjectOfferingId))).toBe(true);
    expect((await get("/teacher-load", USER.lsSunita)).status).toBe(403);
  });

  it("computes each teacher's period count and minutes from tenant slots", async () => {
    const academicYearId = CALENDAR.littleSteps;
    const slots = mockDb.timetableSlots.filter(
      (row) => row.tenantId === tenantId && row.academicYearId === academicYearId,
    );
    const staffIds = [...new Set(slots.flatMap((slot) => slot.staffProfileIds))].sort();
    for (const user of [USER.lsPriya, USER.lsArjun]) {
      const response = await get(`/teacher-load?academicYearId=${academicYearId}`, user);
      expect(response.status).toBe(200);
      const { items } = LoadPage.parse(await response.json());
      expect(items.map((row) => row.staffProfileId).sort()).toEqual(staffIds);
      for (const row of items) {
        const { staffProfileId } = row;
        const assigned = slots.filter((slot) => slot.staffProfileIds.includes(staffProfileId));
        expect(row).toMatchObject({
          academicYearId,
          weeklyPeriods: assigned.length,
          weeklyMinutes: assigned.length * 50,
        });
      }
    }
  });

  it.each([
    `/timetable-slots?classGroupId=${CLASS_GROUP.rvNorthYearTen}`,
    `/teacher-load?academicYearId=${CALENDAR.riversideSchool}`,
  ])("returns 404 for a foreign filter at %s", async (path) => {
    expect((await get(path)).status).toBe(404);
  });

  it("returns 403 without timetable permission", async () => {
    const { roleAssignments } = mockDb;
    mockDb.roleAssignments = roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/timetable-slots")).status).toBe(403);
  });
});
