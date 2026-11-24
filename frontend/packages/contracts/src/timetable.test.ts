import { describe, expect, it } from "vitest";
import {
  BellPeriodSchema,
  BellScheduleSchema,
  RoomSchema,
  TeacherLoadSchema,
  TimetableSlotSchema,
  type BellPeriod,
  type BellSchedule,
  type Room,
  type TeacherLoad,
  type TimetableSlot,
} from "./index";

const scope = { tenantId: "tenant-school", institutionId: "institution-school" };
const timestamps = { createdAt: "2026-06-01T08:00:00Z", updatedAt: "2026-06-02T08:00:00Z" };

const labRoom: Room = {
  tenantId: "tenant-university",
  institutionId: "institution-university",
  ...timestamps,
  id: "room-cs-lab-2",
  campusId: "campus-north",
  code: "LAB-CS2",
  name: "Computing Lab 2",
  kind: "lab",
  capacity: 60,
  active: true,
};

const firstPeriod: BellPeriod = {
  code: "P1",
  label: "Period 1",
  start: "08:00",
  end: "08:45",
  isBreak: false,
};

const k12BellSchedule: BellSchedule = {
  ...scope,
  ...timestamps,
  id: "bell-k12-regular",
  name: "Regular school day",
  periods: [
    firstPeriod,
    { code: "P2", label: "Period 2", start: "08:45", end: "09:30", isBreak: false },
    { code: "BRK1", label: "Morning recess", start: "09:30", end: "09:50", isBreak: true },
    { code: "P3", label: "Period 3", start: "09:50", end: "10:35", isBreak: false },
  ],
};

const universityLectureSlot: TimetableSlot = {
  ...timestamps,
  id: "slot-cs101-mon",
  tenantId: labRoom.tenantId,
  academicYearId: "calendar-uni-2026",
  periodId: "semester-1",
  subjectOfferingId: "offering-cs-101",
  weekday: 1,
  start: "10:00",
  end: "11:30",
  roomId: labRoom.id,
  staffProfileIds: ["staff-prof-raman"],
  effectiveFrom: "2026-08-01",
  effectiveTo: "2026-12-15",
};

const coachingBatchSlot: TimetableSlot = {
  ...timestamps,
  id: "slot-jee-sat",
  tenantId: "tenant-coaching",
  academicYearId: "calendar-coaching-2026",
  periodId: null,
  subjectOfferingId: "offering-physics-jee",
  weekday: 6,
  start: "14:00",
  end: "16:30",
  roomId: null,
  staffProfileIds: ["staff-lead-mentor", "staff-doubt-mentor"],
  effectiveFrom: "2026-06-15",
  effectiveTo: null,
};

const overloadedTeacher: TeacherLoad = {
  staffProfileId: "staff-math-1",
  academicYearId: "calendar-school-2026",
  periodId: "term-1",
  weeklyPeriods: 26,
  weeklyMinutes: 1170,
  maxWeeklyPeriods: 24,
  overloaded: true,
};

describe("Room", () => {
  it.each([
    { kind: "classroom", capacity: 35, campusId: "campus-main" },
    { kind: "lab", capacity: 60, campusId: "campus-north" },
    { kind: "hall", capacity: 5000, campusId: "campus-main" },
    { kind: "library", capacity: 120, campusId: "campus-main" },
    { kind: "sports", capacity: 1, campusId: "campus-main" },
    { kind: "online", capacity: null, campusId: null },
    { kind: "other", capacity: null, campusId: null },
  ] satisfies Partial<Room>[])("accepts a $kind room", (fields) => {
    const row = { ...labRoom, ...fields };
    expect(RoomSchema.parse(row)).toEqual(row);
  });

  it.each([0, 5001, 1.5])("rejects capacity %s", (capacity) => {
    expect(RoomSchema.safeParse({ ...labRoom, capacity }).success).toBe(false);
  });

  it("rejects malformed code", () => {
    expect(RoomSchema.safeParse({ ...labRoom, code: "bad code" }).success).toBe(false);
  });
});

describe("BellSchedule", () => {
  it("accepts a K12 bell schedule with a break", () => {
    expect(BellScheduleSchema.parse(k12BellSchedule)).toEqual(k12BellSchedule);
  });

  it("accepts periods with passing gaps between them", () => {
    const periods: BellPeriod[] = [
      { code: "P1", label: "Period 1", start: "08:00", end: "08:45", isBreak: false },
      { code: "P2", label: "Period 2", start: "08:50", end: "09:35", isBreak: false },
    ];
    expect(BellScheduleSchema.parse({ ...k12BellSchedule, periods }).periods).toEqual(periods);
  });

  it("rejects empty periods and more than 20 periods", () => {
    expect(BellScheduleSchema.safeParse({ ...k12BellSchedule, periods: [] }).success).toBe(false);
    const tooMany: BellPeriod[] = Array.from({ length: 21 }, (_, idx) => {
      const startTotal = idx * 30;
      const startH = String(Math.floor(startTotal / 60)).padStart(2, "0");
      const startM = String(startTotal % 60).padStart(2, "0");
      const endTotal = (idx + 1) * 30;
      const endH = String(Math.floor(endTotal / 60)).padStart(2, "0");
      const endM = String(endTotal % 60).padStart(2, "0");
      return {
        code: `P${idx + 1}`,
        label: `Slot ${idx + 1}`,
        start: `${startH}:${startM}`,
        end: `${endH}:${endM}`,
        isBreak: false,
      };
    });
    const schedule = { ...k12BellSchedule, periods: tooMany };
    expect(BellScheduleSchema.safeParse(schedule).success).toBe(false);
  });

  it("rejects bell period with end <= start", () => {
    const equal = { ...firstPeriod, start: "09:00", end: "09:00" };
    const reversed = { ...firstPeriod, start: "09:30", end: "09:00" };
    const badSchedule = { ...k12BellSchedule, periods: [equal] };
    expect(BellPeriodSchema.safeParse(equal).success).toBe(false);
    expect(BellPeriodSchema.safeParse(reversed).success).toBe(false);
    expect(BellScheduleSchema.safeParse(badSchedule).success).toBe(false);
  });

  it("rejects overlapping bell periods", () => {
    const periods: BellPeriod[] = [
      { code: "P1", label: "Period 1", start: "08:00", end: "08:45", isBreak: false },
      { code: "P2", label: "Period 2", start: "08:30", end: "09:15", isBreak: false },
    ];
    expect(BellScheduleSchema.safeParse({ ...k12BellSchedule, periods }).success).toBe(false);
  });

  it("rejects non-ascending start times", () => {
    const periods: BellPeriod[] = [
      { code: "P2", label: "Period 2", start: "09:00", end: "09:45", isBreak: false },
      { code: "P1", label: "Period 1", start: "08:00", end: "08:45", isBreak: false },
    ];
    expect(BellScheduleSchema.safeParse({ ...k12BellSchedule, periods }).success).toBe(false);
  });

  it("rejects extra keys on a bell period", () => {
    const badPeriod = { ...firstPeriod, extra: true };
    expect(BellPeriodSchema.safeParse(badPeriod).success).toBe(false);
  });
});

describe("TimetableSlot", () => {
  it("accepts a university lecture slot in a lab", () => {
    expect(TimetableSlotSchema.parse(universityLectureSlot)).toEqual(universityLectureSlot);
  });

  it("accepts a coaching batch slot with two staff", () => {
    expect(TimetableSlotSchema.parse(coachingBatchSlot)).toEqual(coachingBatchSlot);
  });

  it("accepts single-day effective window and empty staff list", () => {
    const row: TimetableSlot = {
      ...coachingBatchSlot,
      weekday: 7,
      staffProfileIds: [],
      effectiveTo: coachingBatchSlot.effectiveFrom,
    };
    expect(TimetableSlotSchema.parse(row)).toEqual(row);
  });

  it("rejects end <= start", () => {
    const equal = { ...universityLectureSlot, start: "10:00", end: "10:00" };
    const reversed = { ...universityLectureSlot, start: "11:00", end: "10:30" };
    expect(TimetableSlotSchema.safeParse(equal).success).toBe(false);
    expect(TimetableSlotSchema.safeParse(reversed).success).toBe(false);
  });

  it.each([0, 8, 2.5])("rejects weekday %s", (weekday) => {
    const row = { ...universityLectureSlot, weekday };
    expect(TimetableSlotSchema.safeParse(row).success).toBe(false);
  });

  it("rejects duplicate or more than 10 staff profiles", () => {
    const dup = { ...coachingBatchSlot, staffProfileIds: ["staff-1", "staff-1"] };
    expect(TimetableSlotSchema.safeParse(dup).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, idx) => `staff-${idx}`);
    const tooMany = { ...coachingBatchSlot, staffProfileIds: eleven };
    expect(TimetableSlotSchema.safeParse(tooMany).success).toBe(false);
  });

  it("rejects effectiveTo before effectiveFrom", () => {
    const row = {
      ...universityLectureSlot,
      effectiveFrom: "2026-08-10",
      effectiveTo: "2026-08-09",
    };
    expect(TimetableSlotSchema.safeParse(row).success).toBe(false);
  });
});

describe("TeacherLoad", () => {
  it.each([
    overloadedTeacher,
    { ...overloadedTeacher, weeklyPeriods: 24, overloaded: false },
    { ...overloadedTeacher, periodId: null, maxWeeklyPeriods: null, overloaded: false },
    { ...overloadedTeacher, weeklyPeriods: 0, weeklyMinutes: 0, overloaded: false },
  ] satisfies TeacherLoad[])("accepts load $weeklyPeriods / $maxWeeklyPeriods", (row) => {
    expect(TeacherLoadSchema.parse(row)).toEqual(row);
  });

  it.each([
    { weeklyPeriods: 26, maxWeeklyPeriods: 24, overloaded: false },
    { weeklyPeriods: 24, maxWeeklyPeriods: 24, overloaded: true },
    { weeklyPeriods: 10, maxWeeklyPeriods: 24, overloaded: true },
    { weeklyPeriods: 30, maxWeeklyPeriods: null, overloaded: true },
  ])("rejects overloaded disagreeing with numbers", (fields) => {
    const row = { ...overloadedTeacher, ...fields };
    expect(TeacherLoadSchema.safeParse(row).success).toBe(false);
  });

  it("rejects invalid counts and extra keys", () => {
    const negPeriods = { ...overloadedTeacher, weeklyPeriods: -1 };
    const negMinutes = { ...overloadedTeacher, weeklyMinutes: -1 };
    const zeroMax = { ...overloadedTeacher, maxWeeklyPeriods: 0 };
    const extraKey = { ...overloadedTeacher, extra: true };
    expect(TeacherLoadSchema.safeParse(negPeriods).success).toBe(false);
    expect(TeacherLoadSchema.safeParse(negMinutes).success).toBe(false);
    expect(TeacherLoadSchema.safeParse(zeroMax).success).toBe(false);
    expect(TeacherLoadSchema.safeParse(extraKey).success).toBe(false);
  });
});

const tenantRecords = [
  { name: "Room", schema: RoomSchema, row: labRoom },
  { name: "BellSchedule", schema: BellScheduleSchema, row: k12BellSchedule },
  { name: "TimetableSlot", schema: TimetableSlotSchema, row: universityLectureSlot },
];

it.each(tenantRecords)("$name rejects extra keys and requires tenantId", ({ schema, row }) => {
  expect(schema.safeParse({ ...row, extra: true }).success).toBe(false);
  expect(schema.safeParse({ ...row, tenantId: undefined }).success).toBe(false);
});

describe.each(tenantRecords)("$name timestamp order", ({ schema, row }) => {
  it("compares instants with and without fractional seconds", () => {
    const createdAt = "2026-06-01T08:00:00.000Z";
    const equal = { ...row, createdAt, updatedAt: "2026-06-01T08:00:00Z" };
    const earlier = { ...row, createdAt, updatedAt: "2026-06-01T07:59:59.999Z" };
    expect(schema.safeParse(equal).success).toBe(true);
    expect(schema.safeParse(earlier).success).toBe(false);
  });
});
