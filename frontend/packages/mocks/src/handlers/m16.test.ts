import {
  ApiErrorSchema,
  BellScheduleSchema,
  RoomSchema,
  TeacherLoadSchema,
  TimetableSlotSchema,
  pageSchema,
  type TimetableSlotInput,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CALENDAR, CLASS_GROUP, LEARNER, OFFERING, ROOM, TENANT, USER } from "../fixtures";
import { server } from "../node";

const tenantId = TENANT.littleSteps;
const SlotsPage = pageSchema(TimetableSlotSchema);
const LoadPage = pageSchema(TeacherLoadSchema);

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: user },
  });
}

function post(body: unknown, user: string = USER.lsPriya) {
  return fetch("http://localhost/api/v1/timetable-slots", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: tenantId,
      [MOCK_HEADER.user]: user,
    },
    body: JSON.stringify(body),
  });
}

const baseInput: TimetableSlotInput = {
  academicYearId: CALENDAR.littleSteps,
  periodId: null,
  subjectOfferingId: OFFERING.lsSeedlings[1],
  weekday: 4,
  start: "11:10",
  end: "12:00",
  roomId: ROOM.ls[0],
  staffProfileIds: ["rp-ls-priya-staff"],
  effectiveFrom: "2026-06-01",
  effectiveTo: null,
};

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

describe("POST /timetable-slots", () => {
  it("creates a slot for a manager, stores it and updates teacher load", async () => {
    const response = await post(baseInput);
    expect(response.status).toBe(201);
    const created = TimetableSlotSchema.parse(await response.json());
    expect(created).toMatchObject({ ...baseInput, tenantId });

    const listRes = await get(`/timetable-slots?classGroupId=${CLASS_GROUP.lsSeedlings}`);
    expect(SlotsPage.parse(await listRes.json()).items.some((s) => s.id === created.id)).toBe(true);

    const loadRes = await get(`/teacher-load?academicYearId=${CALENDAR.littleSteps}`);
    expect(LoadPage.parse(await loadRes.json()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          staffProfileId: "rp-ls-priya-staff",
          weeklyPeriods: 1,
          weeklyMinutes: 50,
        }),
      ]),
    );
  });

  it("allows adjacent non-overlapping times and non-overlapping effective dates", async () => {
    const adjacent = await post({
      ...baseInput,
      weekday: 1,
      start: "09:50",
      end: "10:00",
      staffProfileIds: ["rp-ls-arjun-staff"],
    });
    expect(adjacent.status).toBe(201);

    const nextTerm = await post({
      ...baseInput,
      weekday: 1,
      start: "09:00",
      end: "09:50",
      effectiveFrom: "2027-04-01",
      effectiveTo: null,
    });
    expect(nextTerm.status).toBe(201);
  });

  it.each([
    ["teacher", USER.lsArjun],
    ["guardian", USER.lsSunita],
  ])("forbids %s without m16.timetable.manage", async (_role, user) => {
    const response = await post(baseInput, user);
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });

  it("returns 403 module_disabled when M16 is off for the tenant", async () => {
    const ent = mockDb.entitlements.find((e) => e.tenantId === tenantId && e.moduleId === "M16")!;
    ent.enabled = false;
    const response = await post(baseInput);
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("module_disabled");
  });

  it.each([
    ["foreign offering", { subjectOfferingId: OFFERING.rvSouthYearFive[0] }, "subjectOfferingId"],
    ["foreign room", { roomId: ROOM.rvSouth[0] }, "roomId"],
    ["foreign staff profile", { staffProfileIds: ["rp-rv-amira-staff"] }, "staffProfileIds"],
    ["non-staff profile", { staffProfileIds: ["rp-ls-sunita-guardian"] }, "staffProfileIds"],
    ["foreign academic year", { academicYearId: CALENDAR.riversideSchool }, "academicYearId"],
    ["end before start", { start: "12:00", end: "11:00" }, "end"],
  ])("returns 400 invalid_request with top-level path for %s", async (_label, patch, path) => {
    const response = await post({ ...baseInput, ...patch });
    expect(response.status).toBe(400);
    const body = ApiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.details?.[0]?.path).toBe(path);
  });

  it("returns 409 conflict on room, teacher and class group clashes", async () => {
    const roomClash = await post({
      ...baseInput,
      subjectOfferingId: OFFERING.lsExplorer[0],
      weekday: 1,
      start: "09:15",
      end: "09:45",
      roomId: ROOM.ls[0],
      staffProfileIds: [],
    });
    expect(roomClash.status).toBe(409);
    expect(ApiErrorSchema.parse(await roomClash.json()).error.details?.[0]?.path).toBe("roomId");

    const openSlot = await post({
      ...baseInput,
      weekday: 5,
      start: "14:00",
      end: "14:50",
      roomId: null,
      staffProfileIds: ["rp-ls-priya-staff"],
      effectiveFrom: "2026-06-01",
      effectiveTo: null,
    });
    expect(openSlot.status).toBe(201);

    const teacherClash = await post({
      ...baseInput,
      subjectOfferingId: OFFERING.lsExplorer[0],
      weekday: 5,
      start: "14:30",
      end: "15:10",
      roomId: null,
      staffProfileIds: ["rp-ls-priya-staff"],
      effectiveFrom: "2027-06-01",
      effectiveTo: "2027-06-30",
    });
    expect(teacherClash.status).toBe(409);
    expect(ApiErrorSchema.parse(await teacherClash.json()).error.details?.[0]?.path).toBe(
      "staffProfileIds",
    );

    const classClash = await post({
      ...baseInput,
      subjectOfferingId: OFFERING.lsSeedlings[1],
      weekday: 1,
      start: "09:15",
      end: "09:45",
      roomId: null,
      staffProfileIds: [],
    });
    expect(classClash.status).toBe(409);
    expect(ApiErrorSchema.parse(await classClash.json()).error.details?.[0]?.path).toBe(
      "subjectOfferingId",
    );
  });
});
