import { describe, expect, it } from "vitest";
import {
  AcademicCodeSchema,
  ClassGroupSchema,
  ProgramSchema,
  SubjectOfferingSchema,
  SubjectSchema,
  YearLevelSchema,
  type ClassGroup,
  type Program,
  type Subject,
  type SubjectOffering,
  type YearLevel,
} from "./index";

const scope = { tenantId: "tenant-school", institutionId: "institution-school" };
const timestamps = { createdAt: "2026-06-01T08:00:00Z", updatedAt: "2026-06-02T08:00:00Z" };
const program: Program = {
  ...scope,
  ...timestamps,
  id: "program-primary",
  code: "PRIMARY",
  name: "Primary school",
  kind: "school_stage",
  durationYears: 5,
  active: true,
};
const yearLevel: YearLevel = {
  id: "grade-5",
  tenantId: scope.tenantId,
  programId: program.id,
  code: "G5",
  name: "Grade 5",
  order: 5,
};
const section: ClassGroup = {
  ...scope,
  ...timestamps,
  id: "class-5a",
  campusId: "campus-main",
  academicYearId: "calendar-2026",
  programId: program.id,
  yearLevelId: yearLevel.id,
  kind: "section",
  code: "G5.A",
  name: "Grade 5 A",
  capacity: 35,
  homeroomStaffProfileId: "staff-homeroom",
};
const subject: Subject = {
  tenantId: "tenant-university",
  institutionId: "institution-university",
  ...timestamps,
  id: "subject-computing",
  code: "CS-101",
  name: "Introduction to Computing",
  kind: "core",
  credits: 3.5,
  active: true,
};
const offering: SubjectOffering = {
  ...timestamps,
  id: "offering-cs-101",
  tenantId: subject.tenantId,
  academicYearId: "calendar-university-2026",
  periodId: "semester-1",
  classGroupId: "cohort-computing",
  subjectId: subject.id,
  staffProfileIds: ["staff-lecturer", "staff-assistant"],
  weeklyPeriods: 4,
};

describe("AcademicCode", () => {
  it.each(["G5", "BSC-CS", "JEE-26", "a.B_2-3", "A", "A".repeat(32)])("accepts %s", (code) => {
    expect(AcademicCodeSchema.parse(code)).toBe(code);
  });

  it.each(["", "_G5", "G 5", "G/5", "G5\n", "A".repeat(33)])("rejects %j", (code) => {
    expect(AcademicCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe("Program", () => {
  it.each([
    { kind: "early_years", name: "Play school", code: "PLAY", durationYears: 1 },
    { kind: "school_stage", name: "Primary school", code: "PRIMARY", durationYears: 5 },
    { kind: "degree", name: "BSc Computer Science", code: "BSC-CS", durationYears: 3 },
    { kind: "diploma", name: "Design diploma", code: "DIP-DES", durationYears: 2 },
    { kind: "certificate", name: "Welding certificate", code: "CERT-WELD", durationYears: 1 },
    { kind: "course", name: "Rolling language course", code: "LANG", durationYears: null },
    { kind: "batch_program", name: "Entrance exam coaching", code: "JEE-26", durationYears: 1 },
  ] satisfies Partial<Program>[])("accepts $kind programs", (fields) => {
    const row = { ...program, ...fields };
    expect(ProgramSchema.parse(row)).toEqual(row);
  });

  it.each([0, 11, 1.5])("rejects durationYears %s", (durationYears) => {
    expect(ProgramSchema.safeParse({ ...program, durationYears }).success).toBe(false);
  });
});

describe("YearLevel", () => {
  it("accepts a grade linked to a program", () => {
    expect(YearLevelSchema.parse(yearLevel)).toEqual(yearLevel);
  });

  it.each([0, 1.5])("rejects order %s", (order) => {
    expect(YearLevelSchema.safeParse({ ...yearLevel, order }).success).toBe(false);
  });
});

describe("ClassGroup", () => {
  it.each([
    section,
    {
      ...section,
      name: "Entrance exam coaching batch",
      code: "JEE-26.A",
      kind: "batch",
      programId: "program-coaching",
      yearLevelId: null,
      campusId: null,
      capacity: null,
      homeroomStaffProfileId: null,
    },
    { ...section, name: "Computing cohort", kind: "cohort", capacity: 2000 },
    { ...section, name: "Reading group", kind: "group", capacity: 1 },
  ] satisfies ClassGroup[])("accepts a $kind", (row) => {
    expect(ClassGroupSchema.parse(row)).toEqual(row);
  });

  it.each([0, 2001, 1.5])("rejects capacity %s", (capacity) => {
    expect(ClassGroupSchema.safeParse({ ...section, capacity }).success).toBe(false);
  });
});

describe("Subject", () => {
  it.each([
    { kind: "core", credits: 3.5 },
    { kind: "elective", credits: 60 },
    { kind: "language", credits: 0 },
    { kind: "activity", credits: null },
    { kind: "lab", credits: 0.5 },
    { kind: "project", credits: 6 },
  ] satisfies Partial<Subject>[])("accepts a $kind subject", (fields) => {
    const row = { ...subject, ...fields };
    expect(SubjectSchema.parse(row)).toEqual(row);
  });

  it.each([2.25, -0.5, 60.5])("rejects %s credits", (credits) => {
    expect(SubjectSchema.safeParse({ ...subject, credits }).success).toBe(false);
  });
});

describe("SubjectOffering", () => {
  it.each([
    offering,
    { ...offering, periodId: null, weeklyPeriods: null, staffProfileIds: [] },
    {
      ...offering,
      weeklyPeriods: 0,
      staffProfileIds: Array.from({ length: 10 }, (_, index) => `staff-${index}`),
    },
  ])("accepts period $periodId with $weeklyPeriods weekly periods", (row) => {
    expect(SubjectOfferingSchema.parse(row)).toEqual(row);
  });

  it("rejects duplicate staff profiles", () => {
    const row = { ...offering, staffProfileIds: ["staff-lecturer", "staff-lecturer"] };
    expect(SubjectOfferingSchema.safeParse(row).success).toBe(false);
  });

  it("rejects more than ten staff profiles", () => {
    const staffProfileIds = Array.from({ length: 11 }, (_, index) => `staff-${index}`);
    expect(SubjectOfferingSchema.safeParse({ ...offering, staffProfileIds }).success).toBe(false);
  });

  it.each([-1, 61, 1.5])("rejects weeklyPeriods %s", (weeklyPeriods) => {
    expect(SubjectOfferingSchema.safeParse({ ...offering, weeklyPeriods }).success).toBe(false);
  });
});

const codedRecords = [
  { name: "Program", schema: ProgramSchema, row: program },
  { name: "ClassGroup", schema: ClassGroupSchema, row: section },
  { name: "Subject", schema: SubjectSchema, row: subject },
];
const offeringRecord = { name: "SubjectOffering", schema: SubjectOfferingSchema, row: offering };

it.each([...codedRecords, { name: "YearLevel", schema: YearLevelSchema, row: yearLevel }])(
  "$name rejects a malformed code",
  ({ schema, row }) => {
    expect(schema.safeParse({ ...row, code: "bad code" }).success).toBe(false);
  },
);

it.each([
  ...codedRecords,
  offeringRecord,
  { name: "YearLevel", schema: YearLevelSchema, row: yearLevel },
])("$name rejects extra keys and requires a tenant id", ({ schema, row }) => {
  expect(schema.safeParse({ ...row, extra: true }).success).toBe(false);
  expect(schema.safeParse({ ...row, tenantId: undefined }).success).toBe(false);
});

describe.each([...codedRecords, offeringRecord])("$name timestamp order", ({ schema, row }) => {
  it("compares instants with and without fractional seconds", () => {
    const createdAt = "2026-06-01T08:00:00.000Z";
    expect(schema.safeParse({ ...row, createdAt, updatedAt: "2026-06-01T08:00:00Z" }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({ ...row, createdAt, updatedAt: "2026-06-01T07:59:59.999Z" }).success,
    ).toBe(false);
  });
});
