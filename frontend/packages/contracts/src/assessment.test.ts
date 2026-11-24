import { describe, expect, it } from "vitest";
import {
  AssessmentSchema,
  GradeBandSchema,
  GradingSchemeSchema,
  MarkEntrySchema,
  RubricSchema,
} from "./index";

const tenantId = "tenant-school";
const timestamps = {
  createdAt: "2026-08-20T09:00:00Z",
  updatedAt: "2026-08-20T10:00:00Z",
};

const letterScheme = {
  id: "grading-school",
  tenantId,
  institutionId: "institution-school",
  name: "CBSE-style letter grades",
  kind: "letter",
  bands: [
    { code: "A1", label: "A1", minPercent: 91, maxPercent: 100, gradePoint: 10 },
    { code: "A2", label: "A2", minPercent: 81, maxPercent: 91, gradePoint: 9 },
    { code: "B1", label: "B1", minPercent: 71, maxPercent: 81, gradePoint: 8 },
    { code: "B2", label: "B2", minPercent: 61, maxPercent: 71, gradePoint: 7 },
    { code: "C1", label: "C1", minPercent: 51, maxPercent: 61, gradePoint: 6 },
    { code: "C2", label: "C2", minPercent: 41, maxPercent: 51, gradePoint: 5 },
    { code: "D", label: "D", minPercent: 33, maxPercent: 41, gradePoint: 4 },
    { code: "E", label: "E", minPercent: 0, maxPercent: 33, gradePoint: null },
  ],
  ...timestamps,
};

const rubric = {
  id: "rubric-project",
  tenantId,
  name: "Science project rubric",
  criteria: [
    {
      code: "evidence",
      label: "Use of evidence",
      levels: [
        { score: 0, descriptor: "No supporting evidence" },
        { score: 5, descriptor: "Conclusions are supported by measurements" },
      ],
    },
  ],
};

const project = {
  id: "assessment-project",
  tenantId,
  subjectOfferingId: "offering-science",
  name: "Plant growth project",
  kind: "project",
  maxMarks: 20.5,
  weightPercent: 25,
  rubricId: rubric.id,
  dueOn: "2026-09-10",
  status: "marking",
  ...timestamps,
};

const mark = {
  id: "mark-project",
  tenantId,
  assessmentId: project.id,
  learnerId: "learner-01",
  marks: 12.5,
  absent: false,
  rubricScores: { evidence: 5 },
  remark: "The measurements support the conclusion.",
  enteredByStaffProfileId: "staff-science",
  enteredAt: "2026-09-10T11:30:00Z",
  deviceId: "device-classroom",
};

describe("grading schemes", () => {
  it("accepts a CBSE-style letter scheme and preserves the supplied display order", () => {
    expect(GradingSchemeSchema.parse(letterScheme)).toEqual(letterScheme);
  });

  it("accepts a university GPA scheme with fractional cutoffs and grade points", () => {
    const scheme = {
      ...letterScheme,
      id: "grading-university",
      tenantId: "tenant-university",
      institutionId: "institution-university",
      name: "University grade points",
      kind: "gpa",
      bands: [
        { code: "F", label: "Fail", minPercent: 0, maxPercent: 50, gradePoint: 0 },
        { code: "B", label: "Good", minPercent: 50, maxPercent: 79.5, gradePoint: 3.3 },
        { code: "A", label: "Excellent", minPercent: 79.5, maxPercent: 100, gradePoint: 4 },
      ],
    };
    expect(GradingSchemeSchema.parse(scheme)).toEqual(scheme);
  });

  it.each([49, 51])("rejects a coverage discontinuity at %i", (cutoff) => {
    const bands = [
      { code: "F", label: "Fail", minPercent: 0, maxPercent: cutoff, gradePoint: 0 },
      { code: "P", label: "Pass", minPercent: 50, maxPercent: 100, gradePoint: null },
    ];
    expect(GradingSchemeSchema.safeParse({ ...letterScheme, bands }).success).toBe(false);
  });

  it("rejects reversed band limits and grade points in quarter steps", () => {
    const band = { code: "A", label: "A", minPercent: 90, maxPercent: 100, gradePoint: 9.5 };
    expect(GradeBandSchema.safeParse({ ...band, maxPercent: 89 }).success).toBe(false);
    expect(GradeBandSchema.safeParse({ ...band, gradePoint: 9.25 }).success).toBe(false);
  });
});

describe("assessment marks", () => {
  it("accepts a rubric-marked project and its offline mark", () => {
    expect(RubricSchema.parse(rubric)).toEqual(rubric);
    expect(AssessmentSchema.parse(project)).toEqual(project);
    expect(MarkEntrySchema.parse(mark)).toEqual(mark);
  });

  it("accepts an absent learner with a null mark", () => {
    const absent = { ...mark, absent: true, marks: null, rubricScores: null, remark: null };
    expect(MarkEntrySchema.parse(absent)).toEqual(absent);
  });

  it("rejects quarter marks and marks for an absent learner", () => {
    expect(MarkEntrySchema.safeParse({ ...mark, marks: 12.25 }).success).toBe(false);
    expect(MarkEntrySchema.safeParse({ ...mark, absent: true }).success).toBe(false);
  });

  it("rejects extra keys in records and nested rubric levels", () => {
    const criteria = [
      {
        code: "evidence",
        label: "Evidence",
        levels: [
          { score: 0, descriptor: "No evidence", extra: true },
          { score: 5, descriptor: "Supporting evidence" },
        ],
      },
    ];
    expect(RubricSchema.safeParse({ ...rubric, criteria }).success).toBe(false);
    expect(AssessmentSchema.safeParse({ ...project, extra: true }).success).toBe(false);
  });

  it("rejects updates before creation", () => {
    const updatedAt = "2026-08-20T08:00:00Z";
    expect(AssessmentSchema.safeParse({ ...project, updatedAt }).success).toBe(false);
    expect(GradingSchemeSchema.safeParse({ ...letterScheme, updatedAt }).success).toBe(false);
  });
});
