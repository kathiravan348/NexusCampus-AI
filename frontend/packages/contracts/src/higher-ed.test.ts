import { describe, expect, it } from "vitest";
import {
  DegreeAuditSchema,
  ElectiveRegistrationSchema,
  PathAdviceSchema,
  ProgramRequirementSchema,
  RegistrationWindowSchema,
  ThesisSchema,
  type DegreeAudit,
  type ElectiveRegistration,
  type ElectiveRegistrationStatus,
  type PathAdvice,
  type ProgramRequirement,
  type RegistrationWindow,
  type Thesis,
  type ThesisStage,
} from "./index";

const cbcs: ProgramRequirement = {
  id: "requirement-core",
  tenantId: "tenant-university",
  programId: "program-bsc-cs",
  name: "Discipline core",
  category: "core",
  creditSystem: "cbcs",
  minCredits: 84,
  maxCredits: null,
  subjectIds: ["subject-cs101", "subject-cs102"],
  effectiveFromYearId: "calendar-2026",
};
const window: RegistrationWindow = {
  id: "window-sem3",
  tenantId: "tenant-university",
  programId: "program-bsc-cs",
  yearLevelId: "year-2",
  academicYearId: "calendar-2026",
  periodId: "semester-3",
  opensAt: "2026-07-01T03:30:00Z",
  closesAt: "2026-07-10T12:30:00Z",
  minCredits: 4,
  maxCredits: 8,
  status: "open",
};
const registration: ElectiveRegistration = {
  id: "registration-1",
  tenantId: "tenant-university",
  windowId: window.id,
  learnerId: "learner-ravi",
  choices: [
    { subjectOfferingId: "offering-ml", priority: 1 },
    { subjectOfferingId: "offering-hci", priority: 2 },
  ],
  status: "confirmed",
  decidedByStaffProfileId: "staff-registrar",
  decidedAt: "2026-07-12T08:00:00Z",
  clientId: "4b3a2918-7f6e-4d5c-8b4a-39281706f5e4",
  submittedAt: "2026-07-03T09:00:00Z",
};
const audit: DegreeAudit = {
  id: "audit-ravi",
  tenantId: "tenant-university",
  learnerId: "learner-ravi",
  programId: "program-bsc-cs",
  computedAt: "2027-05-01T00:00:00Z",
  creditsEarned: 132,
  creditsRequired: 132,
  gpa: 8.4,
  gpaScale: 10,
  requirements: [
    { requirementId: "requirement-core", creditsEarned: 84, creditsRequired: 84, satisfied: true },
    {
      requirementId: "requirement-elective",
      creditsEarned: 48,
      creditsRequired: 48,
      satisfied: true,
    },
  ],
  eligibleToGraduate: true,
};
const thesis: Thesis = {
  id: "thesis-1",
  tenantId: "tenant-university",
  learnerId: "learner-ravi",
  title: "Energy-aware scheduling for edge devices",
  supervisorStaffProfileIds: ["staff-lecturer"],
  stage: "in_progress",
  milestones: [{ name: "Literature review", dueOn: "2026-09-30", completedOn: "2026-09-25" }],
  externalExaminerName: null,
  originalitySignalId: null,
  createdAt: "2026-07-01T08:00:00Z",
  updatedAt: "2026-09-25T08:00:00Z",
};
const advice: PathAdvice = {
  id: "advice-1",
  tenantId: "tenant-university",
  learnerId: "learner-ravi",
  aiGenerated: true,
  tier: "reasoning",
  suggestions: [
    { subjectId: "subject-ml", reason: "Builds on your strong results in statistics." },
  ],
  warnings: ["Machine Learning needs Linear Algebra first."],
  status: "reviewed",
  reviewedByStaffProfileId: "staff-advisor",
  reviewedAt: "2026-06-20T08:00:00Z",
  createdAt: "2026-06-19T08:00:00Z",
};

describe("requirements and registration", () => {
  it("accepts CBCS and ECTS requirements, an open window and each registration status", () => {
    expect(ProgramRequirementSchema.safeParse(cbcs).success).toBe(true);
    expect(
      ProgramRequirementSchema.safeParse({
        ...cbcs,
        creditSystem: "ects",
        minCredits: 7.5,
        maxCredits: 15,
      }).success,
    ).toBe(true);
    expect(RegistrationWindowSchema.safeParse(window).success).toBe(true);
    expect(ElectiveRegistrationSchema.safeParse(registration).success).toBe(true);
    const open = { decidedByStaffProfileId: null, decidedAt: null };
    const statuses: ElectiveRegistrationStatus[] = ["submitted", "waitlisted", "withdrawn"];
    for (const status of statuses) {
      expect(
        ElectiveRegistrationSchema.safeParse({ ...registration, ...open, status }).success,
      ).toBe(true);
    }
    expect(
      ElectiveRegistrationSchema.safeParse({ ...registration, status: "rejected" }).success,
    ).toBe(true);
  });

  it("rejects bad credits, windows and choices", () => {
    expect(ProgramRequirementSchema.safeParse({ ...cbcs, minCredits: 2.25 }).success).toBe(false);
    expect(ProgramRequirementSchema.safeParse({ ...cbcs, maxCredits: 80 }).success).toBe(false);
    expect(
      RegistrationWindowSchema.safeParse({ ...window, closesAt: window.opensAt }).success,
    ).toBe(false);
    expect(RegistrationWindowSchema.safeParse({ ...window, maxCredits: 2 }).success).toBe(false);
    const samePriority = registration.choices.map((choice) => ({ ...choice, priority: 1 }));
    expect(
      ElectiveRegistrationSchema.safeParse({ ...registration, choices: samePriority }).success,
    ).toBe(false);
    expect(
      ElectiveRegistrationSchema.safeParse({ ...registration, decidedByStaffProfileId: null })
        .success,
    ).toBe(false);
  });
});

describe("degree audit", () => {
  it("accepts an eligible and a not-eligible audit", () => {
    const medicine = {
      requirementId: "requirement-core",
      creditsEarned: 360,
      creditsRequired: 360,
      satisfied: true,
    };
    expect(
      DegreeAuditSchema.safeParse({
        ...audit,
        creditsEarned: 360,
        creditsRequired: 360,
        requirements: [medicine],
      }).success,
    ).toBe(true);
    expect(DegreeAuditSchema.safeParse(audit).success).toBe(true);
    const short = {
      ...audit,
      creditsEarned: 120,
      requirements: [
        audit.requirements[0],
        {
          requirementId: "requirement-elective",
          creditsEarned: 36,
          creditsRequired: 48,
          satisfied: false,
        },
      ],
      eligibleToGraduate: false,
    };
    expect(DegreeAuditSchema.safeParse(short).success).toBe(true);
  });

  it("rejects a verdict that does not follow from the numbers", () => {
    expect(DegreeAuditSchema.safeParse({ ...audit, creditsEarned: 600.5 }).success).toBe(false);
    const unmet = {
      requirementId: "requirement-elective",
      creditsEarned: 36,
      creditsRequired: 48,
      satisfied: false,
    };
    expect(
      DegreeAuditSchema.safeParse({ ...audit, requirements: [audit.requirements[0], unmet] })
        .success,
    ).toBe(false);
    const wrongFlag = { ...unmet, satisfied: true };
    expect(DegreeAuditSchema.safeParse({ ...audit, requirements: [wrongFlag] }).success).toBe(
      false,
    );
    expect(DegreeAuditSchema.safeParse({ ...audit, gpa: 10.5 }).success).toBe(false);
    expect(DegreeAuditSchema.safeParse({ ...audit, gpaScale: 7 }).success).toBe(false);
  });
});

describe("thesis and advice", () => {
  it("accepts each thesis stage and a draft and a reviewed advice", () => {
    const stages: ThesisStage[] = [
      "proposal",
      "in_progress",
      "submitted",
      "under_examination",
      "revisions",
      "accepted",
      "withdrawn",
    ];
    for (const stage of stages) {
      expect(ThesisSchema.safeParse({ ...thesis, stage }).success).toBe(true);
    }
    expect(PathAdviceSchema.safeParse(advice).success).toBe(true);
    expect(
      PathAdviceSchema.safeParse({
        ...advice,
        status: "draft",
        reviewedByStaffProfileId: null,
        reviewedAt: null,
      }).success,
    ).toBe(true);
  });

  it("rejects 4 supervisors and a reviewed advice without a person", () => {
    const four = ["s1", "s2", "s3", "s4"];
    expect(ThesisSchema.safeParse({ ...thesis, supervisorStaffProfileIds: four }).success).toBe(
      false,
    );
    expect(PathAdviceSchema.safeParse({ ...advice, reviewedByStaffProfileId: null }).success).toBe(
      false,
    );
    expect(PathAdviceSchema.safeParse({ ...advice, aiGenerated: false }).success).toBe(false);
  });
});
