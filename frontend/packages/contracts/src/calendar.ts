import { z } from "zod";
import { DisplayCalendarSchema, IdSchema, IsoDateSchema, NameSchema } from "./common";

export const AcademicPeriodKindSchema = z.enum([
  "term",
  "semester",
  "trimester",
  "session",
  "block",
]);
export type AcademicPeriodKind = z.infer<typeof AcademicPeriodKindSchema>;

export const AcademicPeriodSchema = z.strictObject({
  id: IdSchema,
  kind: AcademicPeriodKindSchema,
  name: NameSchema,
  startsOn: IsoDateSchema,
  endsOn: IsoDateSchema,
});
export type AcademicPeriod = z.infer<typeof AcademicPeriodSchema>;

export const HolidaySchema = z.strictObject({
  date: IsoDateSchema,
  name: NameSchema,
});
export type Holiday = z.infer<typeof HolidaySchema>;

/**
 * One academic year of an institution (G-3, D25): its periods, holidays and display calendar.
 * `YYYY-MM-DD` strings compare correctly as text, so the checks below compare strings.
 */
export const AcademicCalendarSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    /** Label shown to users, e.g. `2026-27` or `2026`. */
    academicYear: z.string().trim().min(1).max(20),
    startsOn: IsoDateSchema,
    endsOn: IsoDateSchema,
    periods: z.array(AcademicPeriodSchema),
    holidays: z.array(HolidaySchema),
    displayCalendar: DisplayCalendarSchema,
  })
  .superRefine((cal, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    if (cal.endsOn < cal.startsOn) issue(["endsOn"], "The year ends before it starts");

    const sorted = cal.periods
      .map((p, index) => ({ ...p, index }))
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    for (const p of sorted) {
      if (p.endsOn < p.startsOn)
        issue(["periods", p.index, "endsOn"], "Period ends before it starts");
      if (p.startsOn < cal.startsOn || p.endsOn > cal.endsOn) {
        issue(["periods", p.index], "Period is outside the academic year");
      }
    }
    let latest = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i]!;
      if (latest && cur.startsOn <= latest.endsOn) {
        issue(["periods", cur.index], `Period overlaps "${latest.name}"`);
      }
      if (!latest || cur.endsOn > latest.endsOn) latest = cur;
    }

    cal.holidays.forEach((h, index) => {
      if (h.date < cal.startsOn || h.date > cal.endsOn) {
        issue(["holidays", index, "date"], "Holiday is outside the academic year");
      }
    });
  });
export type AcademicCalendar = z.infer<typeof AcademicCalendarSchema>;
