import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import { IdSchema, IsoDateSchema, NameSchema, UtcDateTimeSchema } from "./common";
import { TimeOfDaySchema } from "./notification";

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

function hasUniqueIds(ids: readonly string[]) {
  return new Set(ids).size === ids.length;
}

function isOverloaded(load: { weeklyPeriods: number; maxWeeklyPeriods: number | null }) {
  return load.maxWeeklyPeriods !== null && load.weeklyPeriods > load.maxWeeklyPeriods;
}

export const RoomKindSchema = z.enum([
  "classroom",
  "lab",
  "hall",
  "library",
  "sports",
  "online",
  "other",
]);
export type RoomKind = z.infer<typeof RoomKindSchema>;

export const RoomSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    campusId: IdSchema.nullable(),
    code: AcademicCodeSchema,
    name: NameSchema,
    kind: RoomKindSchema,
    capacity: z.int().min(1).max(5000).nullable(),
    active: z.boolean(),
    ...timestamps,
  })
  .refine(timestampsInOrder, timestampIssue);
export type Room = z.infer<typeof RoomSchema>;

export const BellPeriodSchema = z
  .strictObject({
    code: AcademicCodeSchema,
    label: z.string().trim().min(1).max(40),
    start: TimeOfDaySchema,
    end: TimeOfDaySchema,
    isBreak: z.boolean(),
  })
  .refine((period) => period.end > period.start, {
    message: "Period end must be after start",
    path: ["end"],
  });
export type BellPeriod = z.infer<typeof BellPeriodSchema>;

export const BellScheduleSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    name: NameSchema,
    periods: z.array(BellPeriodSchema).min(1).max(20),
    ...timestamps,
  })
  .superRefine((schedule, ctx) => {
    for (let i = 1; i < schedule.periods.length; i++) {
      const prev = schedule.periods[i - 1];
      const curr = schedule.periods[i];
      if (!prev || !curr) continue;
      if (curr.start <= prev.start) {
        ctx.addIssue({
          code: "custom",
          path: ["periods", i, "start"],
          message: "Periods must have ascending start times",
        });
      } else if (curr.start < prev.end) {
        ctx.addIssue({
          code: "custom",
          path: ["periods", i, "start"],
          message: "Period overlaps the previous period",
        });
      }
    }
  })
  .refine(timestampsInOrder, timestampIssue);
export type BellSchedule = z.infer<typeof BellScheduleSchema>;

function slotEndsAfterStart(slot: { start: string; end: string }) {
  return slot.end > slot.start;
}

function slotHasUniqueStaff(slot: { staffProfileIds: readonly string[] }) {
  return hasUniqueIds(slot.staffProfileIds);
}

function slotEffectiveDatesInOrder(slot: { effectiveFrom: string; effectiveTo: string | null }) {
  return slot.effectiveTo === null || slot.effectiveTo >= slot.effectiveFrom;
}

const slotEndIssue = {
  message: "Slot end must be after start",
  path: ["end"],
};
const slotStaffIssue = {
  message: "staffProfileIds has duplicates",
  path: ["staffProfileIds"],
};
const slotEffectiveIssue = {
  message: "effectiveTo must be on or after effectiveFrom",
  path: ["effectiveTo"],
};

const timetableSlotFields = {
  /** AcademicCalendar id. */
  academicYearId: IdSchema,
  /** AcademicPeriod id, or null for the whole academic year. */
  periodId: IdSchema.nullable(),
  subjectOfferingId: IdSchema,
  /** ISO weekday: 1 = Monday through 7 = Sunday. */
  weekday: z.int().min(1).max(7),
  start: TimeOfDaySchema,
  end: TimeOfDaySchema,
  roomId: IdSchema.nullable(),
  staffProfileIds: z.array(IdSchema).max(10),
  effectiveFrom: IsoDateSchema,
  effectiveTo: IsoDateSchema.nullable(),
};

/** Input for creating a timetable slot; id, tenantId and timestamps are server-set. */
export const TimetableSlotInputSchema = z
  .strictObject(timetableSlotFields)
  .refine(slotEndsAfterStart, slotEndIssue)
  .refine(slotHasUniqueStaff, slotStaffIssue)
  .refine(slotEffectiveDatesInOrder, slotEffectiveIssue);
export type TimetableSlotInput = z.infer<typeof TimetableSlotInputSchema>;

/**
 * Scheduled timetable slot for a subject offering (M16, D25).
 * Room, teacher and class clashes are server checks, not schema rules.
 */
export const TimetableSlotSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    ...timetableSlotFields,
    ...timestamps,
  })
  .refine(slotEndsAfterStart, slotEndIssue)
  .refine(slotHasUniqueStaff, slotStaffIssue)
  .refine(slotEffectiveDatesInOrder, slotEffectiveIssue)
  .refine(timestampsInOrder, timestampIssue);
export type TimetableSlot = z.infer<typeof TimetableSlotSchema>;

/** Computed read model of a teacher's weekly timetable load (M16). */
export const TeacherLoadSchema = z
  .strictObject({
    staffProfileId: IdSchema,
    /** AcademicCalendar id. */
    academicYearId: IdSchema,
    /** AcademicPeriod id, or null for the whole academic year. */
    periodId: IdSchema.nullable(),
    weeklyPeriods: z.int().min(0),
    weeklyMinutes: z.int().min(0),
    maxWeeklyPeriods: z.int().min(1).nullable(),
    overloaded: z.boolean(),
  })
  .refine((load) => load.overloaded === isOverloaded(load), {
    message: "overloaded must match whether weeklyPeriods exceeds maxWeeklyPeriods",
    path: ["overloaded"],
  });
export type TeacherLoad = z.infer<typeof TeacherLoadSchema>;
