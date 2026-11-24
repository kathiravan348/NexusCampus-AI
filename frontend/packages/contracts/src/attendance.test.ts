import { describe, expect, it } from "vitest";
import {
  AttendanceMarkSchema,
  AttendanceSessionSchema,
  LeaveRequestSchema,
  type AttendanceMark,
  type AttendanceSession,
  type LeaveRequest,
} from "./index";

const scope = { tenantId: "tenant-school", institutionId: "institution-school" };
const timestamps = { createdAt: "2026-06-10T03:00:00Z", updatedAt: "2026-06-10T03:15:00Z" };

const periodSession: AttendanceSession = {
  ...scope,
  ...timestamps,
  id: "att-session-1",
  mode: "period",
  date: "2026-06-10",
  classGroupId: "class-5a",
  timetableSlotId: "slot-5a-math-wed",
  eventLabel: null,
  takenByStaffProfileId: "staff-math-1",
  status: "submitted",
  submittedAt: "2026-06-10T03:12:00Z",
};

const eventSession: AttendanceSession = {
  ...scope,
  ...timestamps,
  id: "att-session-event-1",
  mode: "event",
  date: "2026-06-12",
  classGroupId: null,
  timetableSlotId: null,
  eventLabel: "Annual Science Exhibition",
  takenByStaffProfileId: null,
  status: "open",
  submittedAt: null,
};

const lateQrMark: AttendanceMark = {
  id: "att-mark-1",
  tenantId: scope.tenantId,
  sessionId: periodSession.id,
  learnerId: "learner-ananya",
  status: "late",
  method: "qr",
  minutesLate: 12,
  note: "School bus delayed",
  markedAt: "2026-06-10T03:12:00Z",
  markedByStaffProfileId: "staff-math-1",
  deviceId: "device-tablet-01",
};

const approvedLeave: LeaveRequest = {
  ...timestamps,
  id: "leave-req-1",
  tenantId: scope.tenantId,
  learnerId: "learner-ananya",
  requestedByPersonId: "person-guardian-1",
  from: "2026-06-15",
  to: "2026-06-17",
  reason: "Family travel",
  status: "approved",
  decidedByStaffProfileId: "staff-homeroom",
  decidedAt: "2026-06-10T03:15:00Z",
};

describe("AttendanceSession", () => {
  it("accepts a period session and an event session", () => {
    expect(AttendanceSessionSchema.parse(periodSession)).toEqual(periodSession);
    expect(AttendanceSessionSchema.parse(eventSession)).toEqual(eventSession);
  });

  it.each([
    {
      ...periodSession,
      mode: "daily",
      timetableSlotId: null,
      status: "locked",
      submittedAt: "2026-06-10T04:00:00Z",
    },
    {
      ...periodSession,
      mode: "session",
      timetableSlotId: null,
      status: "open",
      submittedAt: null,
    },
  ] satisfies AttendanceSession[])("accepts a $mode session ($status)", (row) => {
    expect(AttendanceSessionSchema.parse(row)).toEqual(row);
  });

  it("rejects a period session without a timetable slot", () => {
    const row = { ...periodSession, timetableSlotId: null };
    expect(AttendanceSessionSchema.safeParse(row).success).toBe(false);
  });

  it("rejects a non-period session with a timetable slot", () => {
    const row = { ...eventSession, timetableSlotId: "slot-1" };
    expect(AttendanceSessionSchema.safeParse(row).success).toBe(false);
  });

  it("rejects an event session without eventLabel or a non-event with eventLabel", () => {
    const missingLabel = { ...eventSession, eventLabel: null };
    const blankLabel = { ...eventSession, eventLabel: "   " };
    const badPeriod = { ...periodSession, eventLabel: "Not an event" };
    expect(AttendanceSessionSchema.safeParse(missingLabel).success).toBe(false);
    expect(AttendanceSessionSchema.safeParse(blankLabel).success).toBe(false);
    expect(AttendanceSessionSchema.safeParse(badPeriod).success).toBe(false);
  });

  it("rejects submittedAt disagreeing with status", () => {
    const openWithTime = { ...eventSession, submittedAt: "2026-06-10T03:12:00Z" };
    const submittedWithoutTime = { ...periodSession, submittedAt: null };
    const lockedWithoutTime = { ...periodSession, status: "locked", submittedAt: null };
    expect(AttendanceSessionSchema.safeParse(openWithTime).success).toBe(false);
    expect(AttendanceSessionSchema.safeParse(submittedWithoutTime).success).toBe(false);
    expect(AttendanceSessionSchema.safeParse(lockedWithoutTime).success).toBe(false);
  });
});

describe("AttendanceMark", () => {
  it("accepts a late mark with minutes and method qr", () => {
    expect(AttendanceMarkSchema.parse(lateQrMark)).toEqual(lateQrMark);
  });

  it.each([
    { status: "present", method: "manual", minutesLate: null, note: null, deviceId: null },
    { status: "absent", method: "nfc", minutesLate: null, note: null, deviceId: "device-gate" },
    { status: "excused", method: "biometric", minutesLate: null, note: "Clinic visit" },
    { status: "on_leave", method: "geo", minutesLate: null, note: null },
    {
      status: "remote",
      method: "online_join",
      minutesLate: null,
      markedByStaffProfileId: null,
      deviceId: null,
    },
  ] satisfies Partial<AttendanceMark>[])("accepts $status mark via $method", (fields) => {
    const row = { ...lateQrMark, ...fields };
    expect(AttendanceMarkSchema.parse(row)).toEqual(row);
  });

  it("rejects minutesLate on a present mark", () => {
    const row = { ...lateQrMark, status: "present", minutesLate: 5 };
    expect(AttendanceMarkSchema.safeParse(row).success).toBe(false);
  });

  it.each([null, 0, 601, 5.5])("rejects late mark with minutesLate %s", (minutesLate) => {
    const row = { ...lateQrMark, minutesLate };
    expect(AttendanceMarkSchema.safeParse(row).success).toBe(false);
  });

  it("rejects note over 300 characters", () => {
    const row = { ...lateQrMark, note: "a".repeat(301) };
    expect(AttendanceMarkSchema.safeParse(row).success).toBe(false);
  });
});

describe("LeaveRequest", () => {
  it("accepts an approved leave request", () => {
    expect(LeaveRequestSchema.parse(approvedLeave)).toEqual(approvedLeave);
  });

  it.each([
    { ...approvedLeave, to: approvedLeave.from },
    { ...approvedLeave, status: "rejected" },
    { ...approvedLeave, status: "pending", decidedByStaffProfileId: null, decidedAt: null },
    { ...approvedLeave, status: "cancelled", decidedByStaffProfileId: null, decidedAt: null },
  ] satisfies LeaveRequest[])("accepts a $status leave request", (row) => {
    expect(LeaveRequestSchema.parse(row)).toEqual(row);
  });

  it("rejects a decided request without decidedAt or decidedByStaffProfileId", () => {
    const noTime = { ...approvedLeave, decidedAt: null };
    const noStaff = { ...approvedLeave, status: "rejected", decidedByStaffProfileId: null };
    expect(LeaveRequestSchema.safeParse(noTime).success).toBe(false);
    expect(LeaveRequestSchema.safeParse(noStaff).success).toBe(false);
  });

  it("rejects pending or cancelled requests with decision fields", () => {
    const pendingDecided = { ...approvedLeave, status: "pending" };
    const cancelledWithTime = {
      ...approvedLeave,
      status: "cancelled",
      decidedByStaffProfileId: null,
    };
    expect(LeaveRequestSchema.safeParse(pendingDecided).success).toBe(false);
    expect(LeaveRequestSchema.safeParse(cancelledWithTime).success).toBe(false);
  });

  it("rejects to before from and invalid reason", () => {
    const badDates = { ...approvedLeave, from: "2026-06-17", to: "2026-06-15" };
    const blankReason = { ...approvedLeave, reason: "  " };
    const longReason = { ...approvedLeave, reason: "x".repeat(501) };
    expect(LeaveRequestSchema.safeParse(badDates).success).toBe(false);
    expect(LeaveRequestSchema.safeParse(blankReason).success).toBe(false);
    expect(LeaveRequestSchema.safeParse(longReason).success).toBe(false);
  });
});

const allRecords = [
  { name: "AttendanceSession", schema: AttendanceSessionSchema, row: periodSession },
  { name: "AttendanceMark", schema: AttendanceMarkSchema, row: lateQrMark },
  { name: "LeaveRequest", schema: LeaveRequestSchema, row: approvedLeave },
];

it.each(allRecords)("$name rejects extra keys and requires tenantId", ({ schema, row }) => {
  expect(schema.safeParse({ ...row, extra: true }).success).toBe(false);
  expect(schema.safeParse({ ...row, tenantId: undefined }).success).toBe(false);
});

const timestampedRecords = [
  { name: "AttendanceSession", schema: AttendanceSessionSchema, row: periodSession },
  { name: "LeaveRequest", schema: LeaveRequestSchema, row: approvedLeave },
];

describe.each(timestampedRecords)("$name timestamp order", ({ schema, row }) => {
  it("compares instants with and without fractional seconds", () => {
    const createdAt = "2026-06-10T03:00:00.000Z";
    const equal = { ...row, createdAt, updatedAt: "2026-06-10T03:00:00Z" };
    const earlier = { ...row, createdAt, updatedAt: "2026-06-10T02:59:59.999Z" };
    expect(schema.safeParse(equal).success).toBe(true);
    expect(schema.safeParse(earlier).success).toBe(false);
  });
});
