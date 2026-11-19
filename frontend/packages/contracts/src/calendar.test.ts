import { describe, expect, it } from "vitest";
import { AcademicCalendarSchema } from "./calendar";

const calendar = {
  id: "cal_2026",
  tenantId: "ten_riverside_group",
  institutionId: "inst_riverside",
  academicYear: "2026-27",
  startsOn: "2026-06-01",
  endsOn: "2027-04-30",
  periods: [
    { id: "t1", kind: "term", name: "Term 1", startsOn: "2026-06-01", endsOn: "2026-09-30" },
    { id: "t2", kind: "term", name: "Term 2", startsOn: "2026-10-01", endsOn: "2027-01-31" },
    { id: "t3", kind: "term", name: "Term 3", startsOn: "2027-02-01", endsOn: "2027-04-30" },
  ],
  holidays: [{ date: "2026-11-08", name: "Diwali" }],
  displayCalendar: "gregory",
};

const messages = (value: unknown) => {
  const result = AcademicCalendarSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("AcademicCalendar", () => {
  it("accepts a valid year, including one shown in the Hijri calendar", () => {
    expect(messages(calendar)).toEqual([]);
    expect(messages({ ...calendar, displayCalendar: "islamic-umalqura" })).toEqual([]);
  });

  it("accepts a rolling-enrolment year with no periods", () => {
    expect(messages({ ...calendar, periods: [] })).toEqual([]);
  });

  it("rejects a year that ends before it starts", () => {
    expect(messages({ ...calendar, endsOn: "2026-05-01", periods: [], holidays: [] })).toContain(
      "The year ends before it starts",
    );
  });

  it("rejects a period outside the year", () => {
    const periods = [
      { id: "s", kind: "session", name: "Summer", startsOn: "2027-05-01", endsOn: "2027-05-31" },
    ];
    expect(messages({ ...calendar, periods })).toContain("Period is outside the academic year");
  });

  it("rejects a period that ends before it starts", () => {
    const periods = [
      { id: "b", kind: "block", name: "Block", startsOn: "2026-08-01", endsOn: "2026-07-01" },
    ];
    expect(messages({ ...calendar, periods })).toContain("Period ends before it starts");
  });

  it("rejects overlapping periods, in any order or enclosed by an outer period", () => {
    const periods = [calendar.periods[1]!, { ...calendar.periods[0]!, endsOn: "2026-10-15" }];
    expect(messages({ ...calendar, periods })).toContain('Period overlaps "Term 1"');

    const enclosed = [
      { id: "full", kind: "term", name: "Full", startsOn: "2026-06-01", endsOn: "2026-12-31" },
      { id: "sub1", kind: "block", name: "Sub 1", startsOn: "2026-07-01", endsOn: "2026-07-31" },
      { id: "sub2", kind: "block", name: "Sub 2", startsOn: "2026-08-01", endsOn: "2026-08-31" },
    ];
    expect(messages({ ...calendar, periods: enclosed })).toEqual([
      'Period overlaps "Full"',
      'Period overlaps "Full"',
    ]);
  });

  it("rejects a holiday outside the year", () => {
    expect(
      messages({ ...calendar, holidays: [{ date: "2027-08-15", name: "Independence Day" }] }),
    ).toContain("Holiday is outside the academic year");
  });

  it("rejects unknown period kinds, calendars, and extra keys", () => {
    const periods = [{ ...calendar.periods[0]!, kind: "quarter" }];
    expect(AcademicCalendarSchema.safeParse({ ...calendar, periods }).success).toBe(false);
    expect(
      AcademicCalendarSchema.safeParse({ ...calendar, displayCalendar: "islamic" }).success,
    ).toBe(false);
    expect(AcademicCalendarSchema.safeParse({ ...calendar, extra: true }).success).toBe(false);
    expect(
      AcademicCalendarSchema.safeParse({
        ...calendar,
        periods: [{ ...calendar.periods[0]!, extra: true }],
      }).success,
    ).toBe(false);
    expect(
      AcademicCalendarSchema.safeParse({
        ...calendar,
        holidays: [{ ...calendar.holidays[0]!, extra: true }],
      }).success,
    ).toBe(false);
  });
});
