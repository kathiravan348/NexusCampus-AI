import { z } from "zod";
import { IdSchema, IsoDateSchema, UtcDateTimeSchema } from "./common";
import { EnrolmentSchema } from "./learners";

const timestamps = {
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
};
const timestampIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

function timestampsInOrder({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) {
  return Date.parse(updatedAt) >= Date.parse(createdAt);
}

export const AttendanceModeSchema = z.enum(["daily", "period", "session", "event"]);
export type AttendanceMode = z.infer<typeof AttendanceModeSchema>;

/**
 * How attendance was captured (M17).
 * Biometric and geo methods store only the result, never templates or coordinates (V-7).
 */
export const AttendanceMethodSchema = z.enum([
  "manual",
  "qr",
  "nfc",
  "biometric",
  "geo",
  "online_join",
]);
export type AttendanceMethod = z.infer<typeof AttendanceMethodSchema>;

export const AttendanceSessionStatusSchema = z.enum(["open", "submitted", "locked"]);
export type AttendanceSessionStatus = z.infer<typeof AttendanceSessionStatusSchema>;

/** One roll call for a day, timetable period, batch session or event (M17, G-3). */
export const AttendanceSessionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    mode: AttendanceModeSchema,
    date: IsoDateSchema,
    classGroupId: IdSchema.nullable(),
    /** Set iff `mode` is `period`. */
    timetableSlotId: IdSchema.nullable(),
    /** Set iff `mode` is `event`. */
    eventLabel: z.string().trim().min(1).max(120).nullable(),
    /** Null until roll call is taken. */
    takenByStaffProfileId: IdSchema.nullable(),
    status: AttendanceSessionStatusSchema,
    /** Set iff `status` is `submitted` or `locked`. */
    submittedAt: UtcDateTimeSchema.nullable(),
    ...timestamps,
  })
  .refine((session) => (session.timetableSlotId !== null) === (session.mode === "period"), {
    message: "timetableSlotId is required for period sessions and must be null otherwise",
    path: ["timetableSlotId"],
  })
  .refine((session) => (session.eventLabel !== null) === (session.mode === "event"), {
    message: "eventLabel is required for event sessions and must be null otherwise",
    path: ["eventLabel"],
  })
  .refine((session) => (session.submittedAt !== null) === (session.status !== "open"), {
    message: "submittedAt is required when submitted or locked and must be null when open",
    path: ["submittedAt"],
  })
  .refine(timestampsInOrder, timestampIssue);
export type AttendanceSession = z.infer<typeof AttendanceSessionSchema>;

export const AttendanceStatusSchema = z.enum([
  "present",
  "absent",
  "late",
  "excused",
  "on_leave",
  "remote",
]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const AttendanceRosterEntrySchema = z.strictObject({
  learnerId: IdSchema,
  rollNumber: EnrolmentSchema.shape.rollNumber,
});
export type AttendanceRosterEntry = z.infer<typeof AttendanceRosterEntrySchema>;

const markFields = {
  learnerId: IdSchema,
  status: AttendanceStatusSchema,
  /** Set iff `status` is `late`. */
  minutesLate: z.int().min(1).max(600).nullable(),
  /** Personal data; mask per role and never log (G-6, V-7). */
  note: z.string().max(300).nullable(),
};

function validMinutesLate(mark: { status: AttendanceStatus; minutesLate: number | null }) {
  return (mark.minutesLate !== null) === (mark.status === "late");
}

const minutesLateIssue = {
  message: "minutesLate is required when status is late and must be null otherwise",
  path: ["minutesLate"],
};

export const AttendanceMarkInputSchema = z
  .strictObject(markFields)
  .refine(validMinutesLate, minutesLateIssue);
export type AttendanceMarkInput = z.infer<typeof AttendanceMarkInputSchema>;

/**
 * One learner's mark in an attendance session (M17, offline L2).
 * Marks merge `append-only` (`sync.ts`). Biometric and geo methods store only the result, never
 * templates or coordinates (V-7).
 */
export const AttendanceMarkSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    sessionId: IdSchema,
    ...markFields,
    method: AttendanceMethodSchema,
    markedAt: UtcDateTimeSchema,
    /** Null for learner self check-in. */
    markedByStaffProfileId: IdSchema.nullable(),
    /** `DeviceSync` id when marked offline (L2); null when marked online. */
    deviceId: IdSchema.nullable(),
  })
  .refine(validMinutesLate, minutesLateIssue);
export type AttendanceMark = z.infer<typeof AttendanceMarkSchema>;

export const LeaveRequestStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type LeaveRequestStatus = z.infer<typeof LeaveRequestStatusSchema>;

function isDecidedLeave(status: LeaveRequestStatus) {
  return status === "approved" || status === "rejected";
}

/** Learner leave request (M17, D25). `reason` is personal data and must never be logged (V-7). */
export const LeaveRequestSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    requestedByPersonId: IdSchema,
    from: IsoDateSchema,
    to: IsoDateSchema,
    /** Personal data, never logged (V-7). */
    reason: z.string().trim().min(1).max(500),
    status: LeaveRequestStatusSchema,
    /** Set iff `status` is `approved` or `rejected`. */
    decidedByStaffProfileId: IdSchema.nullable(),
    /** Set iff `status` is `approved` or `rejected`. */
    decidedAt: UtcDateTimeSchema.nullable(),
    ...timestamps,
  })
  .refine((request) => request.to >= request.from, {
    message: "to must be on or after from",
    path: ["to"],
  })
  .refine((req) => (req.decidedByStaffProfileId !== null) === isDecidedLeave(req.status), {
    message: "decidedByStaffProfileId is set iff status is approved or rejected",
    path: ["decidedByStaffProfileId"],
  })
  .refine((req) => (req.decidedAt !== null) === isDecidedLeave(req.status), {
    message: "decidedAt is set iff status is approved or rejected",
    path: ["decidedAt"],
  })
  .refine(timestampsInOrder, timestampIssue);
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;
