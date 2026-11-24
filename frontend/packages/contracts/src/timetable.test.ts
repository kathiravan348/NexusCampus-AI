import { describe, expect, it } from "vitest";
import {
  BellPeriodSchema,
  BellScheduleSchema,
  RoomSchema,
  TeacherLoadSchema,
  TimetableSlotInputSchema,
  TimetableSlotSchema,
  type BellPeriod,
  type BellSchedule,
  type Room,
  type TeacherLoad,
  type TimetableSlot,
  type TimetableSlotInput,
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
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
    const tooMany: BellPeriod[] = Array.from({ length: 21 }, (_, idx) => ({
      code: `P${idx + 1}`,
      label: `Slot ${idx + 1}`,
      start: fmt(idx * 30),
      end: fmt((idx + 1) * 30),
      isBreak: false,
    }));
    expect(BellScheduleSchema.safeParse({ ...k12BellSchedule, periods: tooMany }).success).toBe(
      false,
    );
  });

  it("rejects bell period with end <= start", () => {
    const equal = { ...firstPeriod, start: "09:00", end: "09:00" };
    const reversed = { ...firstPeriod, start: "09:30", end: "09:00" };
    expect(BellPeriodSchema.safeParse(equal).success).toBe(false);
    expect(BellPeriodSchema.safeParse(reversed).success).toBe(false);
    expect(BellScheduleSchema.safeParse({ ...k12BellSchedule, periods: [equal] }).success).toBe(
      false,
    );
  });

  it("rejects overlapping or non-ascending bell periods and extra keys", () => {
    const overlap: BellPeriod[] = [
      { code: "P1", label: "Period 1", start: "08:00", end: "08:45", isBreak: false },
      { code: "P2", label: "Period 2", start: "08:30", end: "09:15", isBreak: false },
    ];
    const reversed: BellPeriod[] = [
      { code: "P2", label: "Period 2", start: "09:00", end: "09:45", isBreak: false },
      { code: "P1", label: "Period 1", start: "08:00", end: "08:45", isBreak: false },
    ];
    expect(BellScheduleSchema.safeParse({ ...k12BellSchedule, periods: overlap }).success).toBe(
      false,
    );
    expect(BellScheduleSchema.safeParse({ ...k12BellSchedule, periods: reversed }).success).toBe(
      false,
    );
    expect(BellPeriodSchema.safeParse({ ...firstPeriod, extra: true }).success).toBe(false);
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

  it("rejects end <= start, invalid weekdays, bad staff lists or inverted dates", () => {
    const eleven = Array.from({ length: 11 }, (_, idx) => `staff-${idx}`);
    const invalid = [
      { ...universityLectureSlot, start: "10:00", end: "10:00" },
      { ...universityLectureSlot, start: "11:00", end: "10:30" },
      { ...universityLectureSlot, weekday: 0 },
      { ...universityLectureSlot, weekday: 8 },
      { ...universityLectureSlot, weekday: 2.5 },
      { ...coachingBatchSlot, staffProfileIds: ["staff-1", "staff-1"] },
      { ...coachingBatchSlot, staffProfileIds: eleven },
      { ...universityLectureSlot, effectiveFrom: "2026-08-10", effectiveTo: "2026-08-09" },
    ];
    for (const row of invalid) {
      expect(TimetableSlotSchema.safeParse(row).success).toBe(false);
    }
  });
});

describe("TimetableSlotInput", () => {
  const validInput: TimetableSlotInput = {
    academicYearId: universityLectureSlot.academicYearId,
    periodId: universityLectureSlot.periodId,
    subjectOfferingId: universityLectureSlot.subjectOfferingId,
    weekday: 2,
    start: "09:00",
    end: "09:50",
    roomId: labRoom.id,
    staffProfileIds: ["staff-prof-raman"],
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
  };

  it("accepts valid input and rejects server-set fields or rule violations", () => {
    expect(TimetableSlotInputSchema.parse(validInput)).toEqual(validInput);
    expect(
      TimetableSlotInputSchema.safeParse({ ...validInput, roomId: null, staffProfileIds: [] })
        .success,
    ).toBe(true);
    const invalidCases = [
      { ...validInput, id: "slot-1" },
      { ...validInput, tenantId: "ten-1" },
      { ...validInput, ...timestamps },
      { ...validInput, extra: true },
      { ...validInput, weekday: 8 },
      { ...validInput, end: "09:00" },
      { ...validInput, staffProfileIds: ["s-1", "s-1"] },
      { ...validInput, effectiveTo: "2026-07-31" },
    ];
    for (const candidate of invalidCases) {
      expect(TimetableSlotInputSchema.safeParse(candidate).success).toBe(false);
    }
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
    const invalid = [
      { ...overloadedTeacher, weeklyPeriods: -1 },
      { ...overloadedTeacher, weeklyMinutes: -1 },
      { ...overloadedTeacher, maxWeeklyPeriods: 0 },
      { ...overloadedTeacher, extra: true },
    ];
    for (const row of invalid) expect(TeacherLoadSchema.safeParse(row).success).toBe(false);
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
