import type { ZodType } from "zod";
import { describe, expect, it } from "vitest";
import * as curriculum from "./index";

function accepts(schema: ZodType, value: unknown) {
  expect(schema.safeParse(value).success).toBe(true);
}
function rejects(schema: ZodType, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false);
}

const timestamps = { createdAt: "2026-06-01T08:00:00Z", updatedAt: "2026-06-02T08:00:00Z" };

const standards: curriculum.OutcomeFramework = {
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
const standardsParent: curriculum.Outcome = {
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
const standardsChild: curriculum.Outcome = {
  ...standardsParent,
  id: "outcome-number-a1",
  parentId: standardsParent.id,
  code: "CCSS.MATH.5.NBT.A.1",
  statement: "Recognise that a digit in one place is ten times the digit to its right.",
  caseItemId: null,
};
const courseOutcomes: curriculum.OutcomeFramework = {
  ...standards,
  id: "framework-cs101-co",
  tenantId: "tenant-university",
  institutionId: "institution-university",
  code: "CS101-CO",
  name: "Introduction to Computing — course outcomes",
  kind: "course_outcomes",
  source: "local",
  caseDocumentUri: null,
  version: "1",
};
const mapping: curriculum.OutcomeMapping = {
  id: "mapping-co3-po1",
  tenantId: "tenant-university",
  fromOutcomeId: "outcome-co3",
  toOutcomeId: "outcome-po1",
  strength: 3,
  createdAt: timestamps.createdAt,
};
const unit: curriculum.SyllabusUnit = {
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
const planInput: curriculum.LessonPlanInput = {
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
const plan: curriculum.LessonPlan = {
  ...planInput,
  ...timestamps,
  id: "plan-fractions-1",
  tenantId: "tenant-school",
  status: "draft",
  reviewedByStaffProfileId: null,
  reviewedAt: null,
  reviewNote: null,
};
const entry: curriculum.CoverageEntry = {
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
    accepts(curriculum.OutcomeFrameworkSchema, standards);
    accepts(curriculum.OutcomeFrameworkSchema, courseOutcomes);
    for (const kind of ["program_outcomes", "milestones", "skills"] as const) {
      accepts(curriculum.OutcomeFrameworkSchema, { ...courseOutcomes, kind });
    }
  });

  it("accepts K12 standards with a parent, EY milestones and SK skill levels", () => {
    accepts(curriculum.OutcomeSchema, standardsParent);
    accepts(curriculum.OutcomeSchema, standardsChild);
    // CASE GUIDs from older frameworks need not carry RFC 4122 version / variant bits.
    const legacyGuid = { ...standardsChild, caseItemId: "6b1b4b3e-0f0a-0c55-0f6c-2f2d0d5f5a11" };
    accepts(curriculum.OutcomeSchema, legacyGuid);
    const milestone = { ...standardsParent, code: "PD-4", caseItemId: null };
    accepts(curriculum.OutcomeSchema, { ...milestone, statement: "Uses a pincer grip." });
    accepts(curriculum.OutcomeSchema, { ...milestone, id: "skill-grade-3", code: "PIANO-G3" });
  });

  it("checks codes", () => {
    for (const code of ["CO3", "PO-12", "CCSS.MATH.5.NBT.A.1", "ISTE:1.a"]) {
      accepts(curriculum.OutcomeCodeSchema, code);
    }
    for (const code of ["", "-CO3", "CO 3", "x".repeat(65)]) {
      rejects(curriculum.OutcomeCodeSchema, code);
    }
    rejects(curriculum.OutcomeSchema, { ...standardsChild, code: "bad code" });
    rejects(curriculum.OutcomeFrameworkSchema, { ...standards, code: "NCF MATHS" });
  });

  it("rejects bad frameworks and outcomes", () => {
    rejects(curriculum.OutcomeFrameworkSchema, { ...standards, extra: true });
    rejects(curriculum.OutcomeFrameworkSchema, { ...standards, caseDocumentUri: null });
    rejects(curriculum.OutcomeFrameworkSchema, {
      ...courseOutcomes,
      caseDocumentUri: standards.caseDocumentUri,
    });
    rejects(curriculum.OutcomeFrameworkSchema, {
      ...standards,
      caseDocumentUri: "http://case.example.org/doc",
    });
    rejects(curriculum.OutcomeFrameworkSchema, { ...standards, updatedAt: "2026-05-01T08:00:00Z" });
    rejects(curriculum.OutcomeSchema, { ...standardsChild, parentId: standardsChild.id });
    rejects(curriculum.OutcomeSchema, { ...standardsChild, subjectIds: ["s", "s"] });
    rejects(curriculum.OutcomeSchema, { ...standardsChild, caseItemId: "not-a-uuid" });
    rejects(curriculum.OutcomeSchema, { ...standardsChild, statement: "  " });
  });
});

describe("outcome mappings", () => {
  it("accepts a CO → PO mapping", () => {
    accepts(curriculum.OutcomeMappingSchema, mapping);
  });

  it("rejects self-mapping and strength 4", () => {
    rejects(curriculum.OutcomeMappingSchema, { ...mapping, toOutcomeId: mapping.fromOutcomeId });
    rejects(curriculum.OutcomeMappingSchema, { ...mapping, strength: 4 });
    rejects(curriculum.OutcomeMappingSchema, { ...mapping, strength: 0 });
  });
});

describe("syllabus units", () => {
  it("accepts a unit and a unit without year level or hours", () => {
    accepts(curriculum.SyllabusUnitSchema, unit);
    accepts(curriculum.SyllabusUnitSchema, { ...unit, yearLevelId: null, plannedHours: null });
  });

  it("rejects duplicate topics, quarter hours and empty units", () => {
    const [first, second] = unit.topics;
    rejects(curriculum.SyllabusUnitSchema, { ...unit, topics: [first, { ...second, order: 1 }] });
    rejects(curriculum.SyllabusUnitSchema, {
      ...unit,
      topics: [first, { ...second, id: first?.id }],
    });
    rejects(curriculum.SyllabusUnitSchema, { ...unit, plannedHours: 2.25 });
    rejects(curriculum.SyllabusUnitSchema, { ...unit, plannedHours: 501 });
    rejects(curriculum.SyllabusUnitSchema, { ...unit, topics: [] });
  });
});

describe("lesson plans", () => {
  const reviewed = { reviewedByStaffProfileId: "staff-head", reviewedAt: "2026-06-03T08:00:00Z" };
  const byStatus: Record<curriculum.LessonPlanStatus, curriculum.LessonPlan> = {
    draft: plan,
    submitted: { ...plan, status: "submitted" },
    approved: { ...plan, ...reviewed, status: "approved" },
    returned: { ...plan, ...reviewed, status: "returned", reviewNote: "Add an exit question." },
    delivered: { ...plan, status: "delivered", source: "ai_draft" },
  };

  it("accepts a plan in each status", () => {
    for (const value of Object.values(byStatus)) accepts(curriculum.LessonPlanSchema, value);
  });

  it("accepts an input without server fields and rejects server fields in input", () => {
    accepts(curriculum.LessonPlanInputSchema, planInput);
    rejects(curriculum.LessonPlanInputSchema, { ...planInput, status: "approved" });
  });

  it("rejects review mismatches and bad activities", () => {
    rejects(curriculum.LessonPlanSchema, { ...byStatus.returned, reviewNote: null });
    rejects(curriculum.LessonPlanSchema, { ...byStatus.approved, reviewedAt: null });
    rejects(curriculum.LessonPlanSchema, { ...plan, ...reviewed });
    rejects(curriculum.LessonPlanSchema, { ...plan, ...reviewed, status: "submitted" });
    const deliveredReviewed = { ...byStatus.delivered, ...reviewed };
    accepts(curriculum.LessonPlanSchema, deliveredReviewed);
    rejects(curriculum.LessonPlanSchema, { ...deliveredReviewed, reviewedAt: null });
    const [first] = plan.activities;
    rejects(curriculum.LessonPlanSchema, { ...plan, activities: [first, first] });
    rejects(curriculum.LessonPlanSchema, { ...plan, activities: [{ ...first, minutes: 0 }] });
    rejects(curriculum.LessonPlanSchema, { ...plan, topicIds: [] });
    rejects(curriculum.LessonPlanSchema, { ...plan, source: "ai" });
  });
});

describe("coverage", () => {
  it("accepts covered and open entries", () => {
    accepts(curriculum.CoverageEntrySchema, entry);
    const open = { ...entry, status: "in_progress", coveredOn: null, lessonPlanId: null };
    accepts(curriculum.CoverageEntrySchema, open);
  });

  it("rejects a covered entry without date and a date on an open entry", () => {
    rejects(curriculum.CoverageEntrySchema, { ...entry, coveredOn: null });
    rejects(curriculum.CoverageEntrySchema, { ...entry, status: "not_started" });
  });

  it("checks the percentage against the counts", () => {
    const coverage = {
      subjectOfferingId: "offering-5a-maths",
      topicsTotal: 3,
      topicsCovered: 2,
      percentBps: 6667,
    };
    accepts(curriculum.SyllabusCoverageSchema, coverage);
    accepts(curriculum.SyllabusCoverageSchema, {
      ...coverage,
      topicsTotal: 0,
      topicsCovered: 0,
      percentBps: 0,
    });
    rejects(curriculum.SyllabusCoverageSchema, { ...coverage, percentBps: 6666 });
    rejects(curriculum.SyllabusCoverageSchema, {
      ...coverage,
      topicsCovered: 4,
      percentBps: 13333,
    });
  });
});

describe("lesson plan workflow inputs", () => {
  it("requires an empty submission and a calendar date for delivery", () => {
    accepts(curriculum.LessonPlanSubmitInputSchema, {});
    rejects(curriculum.LessonPlanSubmitInputSchema, { status: "submitted" });
    accepts(curriculum.LessonPlanDeliveredInputSchema, { deliveredOn: "2026-10-01" });
    rejects(curriculum.LessonPlanDeliveredInputSchema, {});
    rejects(curriculum.LessonPlanDeliveredInputSchema, { deliveredOn: "tomorrow" });
    rejects(curriculum.LessonPlanDeliveredInputSchema, {
      deliveredOn: "2026-10-01",
      actor: "other",
    });
  });

  it("requires a decision and a bounded note for returns", () => {
    accepts(curriculum.LessonPlanReviewInputSchema, { decision: "approve", note: null });
    accepts(curriculum.LessonPlanReviewInputSchema, { decision: "return", note: "x".repeat(1000) });
    for (const note of [null, " ", "", "x".repeat(1001)]) {
      rejects(curriculum.LessonPlanReviewInputSchema, { decision: "return", note });
    }
    rejects(curriculum.LessonPlanReviewInputSchema, { decision: "approve" });
    rejects(curriculum.LessonPlanReviewInputSchema, { decision: "approve", note: "" });
    rejects(curriculum.LessonPlanReviewInputSchema, { decision: "other", note: null });
    rejects(curriculum.LessonPlanReviewInputSchema, {
      decision: "approve",
      note: null,
      id: "plan",
    });
  });
});
