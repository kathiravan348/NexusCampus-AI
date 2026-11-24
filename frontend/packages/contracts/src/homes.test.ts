import { describe, expect, it } from "vitest";
import { HomeCardSchema, KpiSchema, RoleHomeSchema, SavedViewSchema } from "./homes";

const attendanceCard = {
  kind: "attendance",
  titleKey: "m25.home.attendance",
  moduleId: "M17",
  count: 0,
  severity: "info",
  href: "/family/attendance",
};

const feesCard = {
  kind: "fees",
  titleKey: "m25.home.feesDue",
  moduleId: "M18",
  count: 1,
  severity: "warning",
  href: "/family/fees",
};

const familyHome = {
  role: "family",
  personId: "per-parent-1",
  learnerIds: ["lrn-1", "lrn-2"],
  cards: [attendanceCard, feesCard],
  generatedAt: "2026-11-24T08:00:00Z",
};

const staffHome = {
  role: "staff",
  personId: "per-staff-1",
  learnerIds: [],
  cards: [
    {
      kind: "kpi",
      titleKey: "m27.home.classesToday",
      moduleId: "M16",
      count: 5,
      severity: null,
      href: "/staff/timetable",
    },
  ],
  generatedAt: "2026-11-24T08:00:00Z",
};

const inrFeeKpi = {
  code: "fees_collected_month",
  labelKey: "m28.kpi.feesCollected",
  value: 14500000,
  unit: "minor_units",
  currency: "INR",
  trend: "up",
  asOf: "2026-11-24T08:00:00Z",
};

const savedView = {
  id: "view-1",
  tenantId: "ten-1",
  ownerPersonId: "per-staff-1",
  moduleId: "M17",
  name: "Grade 5 morning absences",
  filters: {
    academicYearId: "ay-2026",
    classGroupId: "cg-5a",
    status: "absent",
  },
  createdAt: "2026-11-24T08:00:00Z",
};

const fails = (result: { success: boolean }) => expect(result.success).toBe(false);

describe("HomeCardSchema and RoleHomeSchema", () => {
  it("accepts a family home with two children and a staff home", () => {
    expect(RoleHomeSchema.parse(familyHome)).toEqual(familyHome);
    expect(RoleHomeSchema.parse(staffHome)).toEqual(staffHome);
  });

  it("rejects bad href values on home cards", () => {
    const badHrefs = [
      "https://example.com/fees",
      "//evil.example/fees",
      "family/fees",
      "/Family/Fees",
      "/family/fees?tab=1",
    ];
    for (const href of badHrefs) {
      fails(HomeCardSchema.safeParse({ ...attendanceCard, href }));
    }
  });

  it("rejects staff/leader homes with learnerIds, duplicates, empty cards, and extra keys", () => {
    fails(RoleHomeSchema.safeParse({ ...staffHome, learnerIds: ["lrn-1"] }));
    const leaderWithChild = { ...staffHome, role: "leader", learnerIds: ["lrn-1"] };
    const dupeChildren = { ...familyHome, learnerIds: ["lrn-1", "lrn-1"] };
    fails(RoleHomeSchema.safeParse(leaderWithChild));
    fails(RoleHomeSchema.safeParse(dupeChildren));
    fails(RoleHomeSchema.safeParse({ ...familyHome, cards: [] }));
    fails(RoleHomeSchema.safeParse({ ...familyHome, extra: true }));
    fails(HomeCardSchema.safeParse({ ...attendanceCard, extra: true }));
  });
});

describe("KpiSchema and SavedViewSchema", () => {
  it("accepts a KPI in INR minor units, a percent KPI, and a saved view", () => {
    expect(KpiSchema.parse(inrFeeKpi)).toEqual(inrFeeKpi);
    const attendanceKpi = {
      code: "daily_attendance_pct",
      labelKey: "m28.kpi.dailyAttendance",
      value: 94.5,
      unit: "percent",
      currency: null,
      trend: "flat",
      asOf: "2026-11-24T08:00:00Z",
    };
    expect(KpiSchema.parse(attendanceKpi)).toEqual(attendanceKpi);
    expect(SavedViewSchema.parse(savedView)).toEqual(savedView);
  });

  it("rejects minor_units without currency, non-money with currency, or bad code", () => {
    fails(KpiSchema.safeParse({ ...inrFeeKpi, currency: null }));
    fails(KpiSchema.safeParse({ ...inrFeeKpi, unit: "count", currency: "INR" }));
    fails(KpiSchema.safeParse({ ...inrFeeKpi, value: 12.5 }));
    fails(KpiSchema.safeParse({ ...inrFeeKpi, code: "BadCode" }));
    fails(KpiSchema.safeParse({ ...inrFeeKpi, extra: true }));
  });

  it("rejects saved views with more than 20 filter keys or extra keys", () => {
    const tooManyFilters = Object.fromEntries(
      Array.from({ length: 21 }, (_, idx) => [`key_${idx}`, `val_${idx}`]),
    );
    fails(SavedViewSchema.safeParse({ ...savedView, filters: tooManyFilters }));
    fails(SavedViewSchema.safeParse({ ...savedView, extra: true }));
  });
});
