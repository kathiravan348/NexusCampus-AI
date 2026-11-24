import { describe, expect, it } from "vitest";
import {
  EnrolmentSchema,
  HealthFlagSchema,
  LearnerDocumentSchema,
  LearnerSchema,
  type Enrolment,
  type Learner,
  type LearnerDocument,
} from "./index";

const createdAt = "2025-06-01T09:00:00Z";
const updatedAt = "2025-06-01T10:00:00Z";
const playSchoolLearner = {
  id: "learner-play-school",
  tenantId: "tenant-play-school",
  institutionId: "play-school",
  campusId: null,
  personId: "person-play-school",
  roleProfileId: "role-play-school",
  learnerNumber: "PLAY-001",
  admissionDate: "2025-06-01",
  status: "enrolled",
  leftOn: null,
  healthFlags: [{ kind: "allergy", label: "Peanut allergy", note: null }],
  customFields: {},
  retentionState: "active",
  createdAt,
  updatedAt,
} satisfies Learner;

const k12Learner = {
  ...playSchoolLearner,
  id: "learner-k12",
  tenantId: "tenant-k12",
  institutionId: "school-k12",
  campusId: "campus-k12",
  personId: "person-k12",
  roleProfileId: "role-k12",
  learnerNumber: "K12-001",
  healthFlags: [],
} satisfies Learner;

const firstYear = {
  id: "enrolment-2025",
  tenantId: k12Learner.tenantId,
  learnerId: k12Learner.id,
  academicYearId: "year-2025",
  programId: "program-primary",
  yearLevelId: "level-1",
  classGroupId: "group-2025",
  rollNumber: "01",
  status: "completed",
  effectiveFrom: "2025-06-01",
  effectiveTo: "2026-05-31",
  createdAt,
  updatedAt: "2026-05-31T09:00:00Z",
} satisfies Enrolment;

const secondYear = {
  ...firstYear,
  id: "enrolment-2026",
  academicYearId: "year-2026",
  yearLevelId: "level-2",
  classGroupId: "group-2026",
  status: "active",
  effectiveFrom: "2026-06-01",
  effectiveTo: null,
  createdAt: "2026-06-01T09:00:00Z",
  updatedAt: "2026-06-01T09:00:00Z",
} satisfies Enrolment;

const learnerDocument = {
  id: "document-1",
  tenantId: k12Learner.tenantId,
  learnerId: k12Learner.id,
  kind: "birth_certificate",
  fileName: "Birth certificate.pdf",
  contentType: "application/pdf",
  sizeBytes: 20_000_000,
  verified: true,
  verifiedByStaffProfileId: "role-staff-1",
  uploadedAt: createdAt,
} satisfies LearnerDocument;

describe("Learner", () => {
  it("accepts a play-school learner with an allergy flag", () => {
    expect(LearnerSchema.parse(playSchoolLearner)).toEqual(playSchoolLearner);
  });

  it.each(["withdrawn", "transferred_out", "graduated", "alumni"] as const)(
    "requires a departure date for %s",
    (status) => {
      const ended = { ...k12Learner, status };
      expect(LearnerSchema.safeParse(ended).success).toBe(false);
      expect(LearnerSchema.safeParse({ ...ended, leftOn: "2026-05-31" }).success).toBe(true);
      expect(LearnerSchema.safeParse({ ...ended, leftOn: "2025-05-31" }).success).toBe(false);
    },
  );

  it.each(["enrolled", "on_leave"] as const)("rejects a departure date for %s", (status) => {
    const learner = { ...playSchoolLearner, status, leftOn: "2025-06-01" };
    expect(LearnerSchema.safeParse(learner).success).toBe(false);
  });

  it("rejects extra keys on a learner or a health flag and reversed timestamps", () => {
    const [healthFlag] = playSchoolLearner.healthFlags;
    const reversedTimestamps = { ...playSchoolLearner, updatedAt: "2025-06-01T08:00:00Z" };
    expect(HealthFlagSchema.safeParse({ ...healthFlag, extra: true }).success).toBe(false);
    expect(LearnerSchema.safeParse({ ...playSchoolLearner, extra: true }).success).toBe(false);
    expect(LearnerSchema.safeParse(reversedTimestamps).success).toBe(false);
  });
});

describe("Enrolment", () => {
  it("accepts a K12 learner's enrolments across two academic years", () => {
    const learner = LearnerSchema.parse(k12Learner);
    const history = [firstYear, secondYear].map((entry) => EnrolmentSchema.parse(entry));
    expect(history.map((entry) => entry.learnerId)).toEqual([learner.id, learner.id]);
    expect(history.map((entry) => entry.academicYearId)).toEqual(["year-2025", "year-2026"]);
  });

  it.each(["completed", "withdrawn"] as const)("requires an end date for %s", (status) => {
    const enrolment = { ...firstYear, status, effectiveTo: null };
    expect(EnrolmentSchema.safeParse(enrolment).success).toBe(false);
  });

  it("rejects reversed dates or timestamps and extra keys", () => {
    const reversedDates = { ...firstYear, effectiveTo: "2025-05-31" };
    const reversedTimestamps = { ...secondYear, updatedAt: createdAt };
    expect(EnrolmentSchema.safeParse(reversedDates).success).toBe(false);
    expect(EnrolmentSchema.safeParse(reversedTimestamps).success).toBe(false);
    expect(EnrolmentSchema.safeParse({ ...firstYear, extra: true }).success).toBe(false);
  });
});

describe("LearnerDocument", () => {
  it("accepts verified and unverified metadata", () => {
    expect(LearnerDocumentSchema.parse(learnerDocument)).toEqual(learnerDocument);
    const unverified = { ...learnerDocument, verified: false, verifiedByStaffProfileId: null };
    expect(LearnerDocumentSchema.parse(unverified)).toEqual(unverified);
  });

  it.each(["../certificate.pdf", "folder\\certificate.pdf", "C:certificate.pdf", ".."])(
    "rejects a path as its file name (%s)",
    (fileName) => {
      const document = { ...learnerDocument, fileName };
      expect(LearnerDocumentSchema.safeParse(document).success).toBe(false);
    },
  );

  it("requires a verifier exactly for verified documents", () => {
    const missingVerifier = { ...learnerDocument, verifiedByStaffProfileId: null };
    const unexpectedVerifier = { ...learnerDocument, verified: false };
    expect(LearnerDocumentSchema.safeParse(missingVerifier).success).toBe(false);
    expect(LearnerDocumentSchema.safeParse(unexpectedVerifier).success).toBe(false);
  });

  it("rejects invalid sizes, unsupported content types and extra keys", () => {
    for (const changes of [
      { sizeBytes: 0 },
      { sizeBytes: 20_000_001 },
      { sizeBytes: 1.5 },
      { contentType: "image/gif" },
      { extra: true },
    ]) {
      const document = { ...learnerDocument, ...changes };
      expect(LearnerDocumentSchema.safeParse(document).success).toBe(false);
    }
  });
});
