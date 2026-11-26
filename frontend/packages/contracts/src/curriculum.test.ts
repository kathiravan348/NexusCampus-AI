import { describe, expect, it } from "vitest";
import {
  CoverageEntrySchema,
  LessonPlanInputSchema,
  LessonPlanSchema,
  OutcomeCodeSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  SyllabusCoverageSchema,
  SyllabusUnitSchema,
  type CoverageEntry,
  type LessonPlan,
  type LessonPlanInput,
  type LessonPlanStatus,
  type Outcome,
  type OutcomeFramework,
  type OutcomeMapping,
  type SyllabusUnit,
} from "./index";

const timestamps = { createdAt: "2026-06-01T08:00:00Z", updatedAt: "2026-06-02T08:00:00Z" };

const standards: OutcomeFramework = {
  ...timestamps,
  id: "framework-national-maths",
  tenantId: "tenant-school",
  institutionId: null,
  code: "NCF-MATHS",
  name: "National maths standards",
  kind: "standards",
  source: "case_import",
  caseDocumentUri: "https://case.example.org/ims/case/v1p0/CFDocuments/maths",
  version: "2023",
  active: true,
};
const standardsParent: Outcome = {
  ...timestamps,
  id: "outcome-number",
  tenantId: "tenant-school",
  frameworkId: standards.id,
  parentId: null,
  code: "CCSS.MATH.5.NBT",
  statement: "Understand the place value system.",
  order: 1,
  caseItemId: "6b1b4b3e-0f0a-4c55-9f6c-2f2d0d5f5a11",
  subjectIds: ["subject-maths"],
  yearLevelIds: ["grade-5"],
};
const standardsChild: Outcome = {
  ...standardsParent,
  id: "outcome-number-a1",
  parentId: standardsParent.id,
  code: "CCSS.MATH.5.NBT.A.1",
  statement: "Recognise that a digit in one place is ten times the digit to its right.",
  caseItemId: null,
};
const courseOutcomes: OutcomeFramework = {
  ...timestamps,
  id: "framework-cs101-co",
  tenantId: "tenant-university",
  institutionId: "institution-university",
  code: "CS101-CO",
  name: "Introduction to Computing — course outcomes",
  kind: "course_outcomes",
  source: "local",
  caseDocumentUri: null,
  version: "1",
  active: true,
};
const mapping: OutcomeMapping = {
  id: "mapping-co3-po1",
  tenantId: "tenant-university",
  fromOutcomeId: "outcome-co3",
  toOutcomeId: "outcome-po1",
  strength: 3,
  createdAt: timestamps.createdAt,
};
const unit: SyllabusUnit = {
  ...timestamps,
  id: "unit-fractions",
  tenantId: "tenant-school",
  subjectId: "subject-maths",
  yearLevelId: "grade-5",
  code: "U3",
  title: "Fractions",
  order: 3,
  plannedHours: 12.5,
  outcomeIds: [standardsChild.id],
  topics: [
    { id: "topic-equivalent", title: "Equivalent fractions", order: 1, outcomeIds: [] },
    { id: "topic-adding", title: "Adding fractions", order: 2, outcomeIds: [standardsChild.id] },
  ],
};
const planInput: LessonPlanInput = {
  subjectOfferingId: "offering-5a-maths",
  staffProfileId: "staff-maths",
  date: "2026-07-06",
  timetableSlotId: "slot-5a-mon-2",
  title: "Equivalent fractions with strips",
  topicIds: ["topic-equivalent"],
  outcomeIds: [standardsChild.id],
  objectives: "Learners find two equivalent fractions with paper strips.",
  activities: [
    { order: 1, title: "Warm-up", minutes: 5, kind: "intro" },
    { order: 2, title: "Fraction strips", minutes: 25, kind: "practice" },
  ],
  resources: "Paper strips, coloured pencils",
  source: "manual",
};
const plan: LessonPlan = {
  ...planInput,
  ...timestamps,
  id: "plan-fractions-1",
  tenantId: "tenant-school",
  status: "draft",
  reviewedByStaffProfileId: null,
  reviewedAt: null,
  reviewNote: null,
};
const entry: CoverageEntry = {
  id: "coverage-5a-equivalent",
  tenantId: "tenant-school",
  subjectOfferingId: "offering-5a-maths",
  topicId: "topic-equivalent",
  status: "covered",
  coveredOn: "2026-07-06",
  lessonPlanId: plan.id,
  updatedAt: timestamps.updatedAt,
};

describe("outcome frameworks and outcomes", () => {
  it("accepts every framework kind", () => {
    expect(OutcomeFrameworkSchema.safeParse(standards).success).toBe(true);
    expect(OutcomeFrameworkSchema.safeParse(courseOutcomes).success).toBe(true);
    for (const kind of ["program_outcomes", "milestones", "skills"] as const) {
      expect(OutcomeFrameworkSchema.safeParse({ ...courseOutcomes, kind }).success).toBe(true);
    }
  });

  it("accepts K12 standards with a parent, EY milestones and SK skill levels", () => {
    expect(OutcomeSchema.safeParse(standardsParent).success).toBe(true);
    expect(OutcomeSchema.safeParse(standardsChild).success).toBe(true);
    const milestone = {
      ...standardsParent,
      id: "milestone-pincer",
      code: "PD-4",
      subjectIds: [],
      yearLevelIds: [],
    };
    expect(
      OutcomeSchema.safeParse({ ...milestone, statement: "Uses a pincer grip." }).success,
    ).toBe(true);
    const skill = { ...milestone, id: "skill-grade-3", code: "PIANO-G3", caseItemId: null };
    expect(OutcomeSchema.safeParse(skill).success).toBe(true);
  });

  it("checks codes", () => {
    for (const code of ["CO3", "PO-12", "CCSS.MATH.5.NBT.A.1", "ISTE:1.a"]) {
      expect(OutcomeCodeSchema.safeParse(code).success).toBe(true);
    }
    for (const code of ["", "-CO3", "CO 3", "x".repeat(65)]) {
      expect(OutcomeCodeSchema.safeParse(code).success).toBe(false);
    }
    expect(OutcomeSchema.safeParse({ ...standardsChild, code: "bad code" }).success).toBe(false);
    expect(OutcomeFrameworkSchema.safeParse({ ...standards, code: "NCF MATHS" }).success).toBe(
      false,
    );
  });

  it("rejects bad frameworks and outcomes", () => {
    expect(OutcomeFrameworkSchema.safeParse({ ...standards, extra: true }).success).toBe(false);
    expect(OutcomeFrameworkSchema.safeParse({ ...standards, caseDocumentUri: null }).success).toBe(
      false,
    );
    expect(
      OutcomeFrameworkSchema.safeParse({
        ...courseOutcomes,
        caseDocumentUri: standards.caseDocumentUri,
      }).success,
    ).toBe(false);
    expect(
      OutcomeFrameworkSchema.safeParse({
        ...standards,
        caseDocumentUri: "http://case.example.org/doc",
      }).success,
    ).toBe(false);
    expect(
      OutcomeFrameworkSchema.safeParse({ ...standards, updatedAt: "2026-05-01T08:00:00Z" }).success,
    ).toBe(false);
    expect(
      OutcomeSchema.safeParse({ ...standardsChild, parentId: standardsChild.id }).success,
    ).toBe(false);
    expect(OutcomeSchema.safeParse({ ...standardsChild, subjectIds: ["s", "s"] }).success).toBe(
      false,
    );
    expect(OutcomeSchema.safeParse({ ...standardsChild, caseItemId: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(OutcomeSchema.safeParse({ ...standardsChild, statement: "  " }).success).toBe(false);
  });
});

describe("outcome mappings", () => {
  it("accepts a CO → PO mapping", () => {
    expect(OutcomeMappingSchema.safeParse(mapping).success).toBe(true);
  });

  it("rejects self-mapping and strength 4", () => {
    expect(
      OutcomeMappingSchema.safeParse({ ...mapping, toOutcomeId: mapping.fromOutcomeId }).success,
    ).toBe(false);
    expect(OutcomeMappingSchema.safeParse({ ...mapping, strength: 4 }).success).toBe(false);
    expect(OutcomeMappingSchema.safeParse({ ...mapping, strength: 0 }).success).toBe(false);
  });
});

describe("syllabus units", () => {
  it("accepts a unit and a unit without year level or hours", () => {
    expect(SyllabusUnitSchema.safeParse(unit).success).toBe(true);
    expect(
      SyllabusUnitSchema.safeParse({ ...unit, yearLevelId: null, plannedHours: null }).success,
    ).toBe(true);
  });

  it("rejects duplicate topics, quarter hours and empty units", () => {
    const [first, second] = unit.topics;
    expect(
      SyllabusUnitSchema.safeParse({ ...unit, topics: [first, { ...second, order: 1 }] }).success,
    ).toBe(false);
    expect(
      SyllabusUnitSchema.safeParse({ ...unit, topics: [first, { ...second, id: first?.id }] })
        .success,
    ).toBe(false);
    expect(SyllabusUnitSchema.safeParse({ ...unit, plannedHours: 2.25 }).success).toBe(false);
    expect(SyllabusUnitSchema.safeParse({ ...unit, plannedHours: 501 }).success).toBe(false);
    expect(SyllabusUnitSchema.safeParse({ ...unit, topics: [] }).success).toBe(false);
  });
});

describe("lesson plans", () => {
  const reviewed = { reviewedByStaffProfileId: "staff-head", reviewedAt: "2026-06-03T08:00:00Z" };
  const byStatus: Record<LessonPlanStatus, LessonPlan> = {
    draft: plan,
    submitted: { ...plan, status: "submitted" },
    approved: { ...plan, ...reviewed, status: "approved" },
    returned: { ...plan, ...reviewed, status: "returned", reviewNote: "Add an exit question." },
    delivered: { ...plan, status: "delivered", source: "ai_draft" },
  };

  it("accepts a plan in each status", () => {
    for (const value of Object.values(byStatus)) {
      expect(LessonPlanSchema.safeParse(value).success).toBe(true);
    }
  });

  it("accepts an input without server fields and rejects server fields in input", () => {
    expect(LessonPlanInputSchema.safeParse(planInput).success).toBe(true);
    expect(LessonPlanInputSchema.safeParse({ ...planInput, status: "approved" }).success).toBe(
      false,
    );
  });

  it("rejects review mismatches and bad activities", () => {
    expect(LessonPlanSchema.safeParse({ ...byStatus.returned, reviewNote: null }).success).toBe(
      false,
    );
    expect(LessonPlanSchema.safeParse({ ...byStatus.approved, reviewedAt: null }).success).toBe(
      false,
    );
    expect(LessonPlanSchema.safeParse({ ...plan, ...reviewed }).success).toBe(false);
    const [first] = plan.activities;
    expect(LessonPlanSchema.safeParse({ ...plan, activities: [first, first] }).success).toBe(false);
    expect(
      LessonPlanSchema.safeParse({ ...plan, activities: [{ ...first, minutes: 0 }] }).success,
    ).toBe(false);
    expect(LessonPlanSchema.safeParse({ ...plan, topicIds: [] }).success).toBe(false);
    expect(LessonPlanSchema.safeParse({ ...plan, source: "ai" }).success).toBe(false);
  });
});

describe("coverage", () => {
  it("accepts covered and open entries", () => {
    expect(CoverageEntrySchema.safeParse(entry).success).toBe(true);
    const open = { ...entry, status: "in_progress", coveredOn: null, lessonPlanId: null };
    expect(CoverageEntrySchema.safeParse(open).success).toBe(true);
  });

  it("rejects a covered entry without date and a date on an open entry", () => {
    expect(CoverageEntrySchema.safeParse({ ...entry, coveredOn: null }).success).toBe(false);
    expect(CoverageEntrySchema.safeParse({ ...entry, status: "not_started" }).success).toBe(false);
  });

  it("checks the percentage against the counts", () => {
    const coverage = {
      subjectOfferingId: "offering-5a-maths",
      topicsTotal: 3,
      topicsCovered: 2,
      percentBps: 6667,
    };
    expect(SyllabusCoverageSchema.safeParse(coverage).success).toBe(true);
    expect(
      SyllabusCoverageSchema.safeParse({
        ...coverage,
        topicsTotal: 0,
        topicsCovered: 0,
        percentBps: 0,
      }).success,
    ).toBe(true);
    expect(SyllabusCoverageSchema.safeParse({ ...coverage, percentBps: 6666 }).success).toBe(false);
    expect(
      SyllabusCoverageSchema.safeParse({ ...coverage, topicsCovered: 4, percentBps: 13333 })
        .success,
    ).toBe(false);
  });
});
