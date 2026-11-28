import * as C from "@nexus/contracts";
import { expect, it } from "vitest";
import { CLASS_GROUPS, PROGRAMS, SUBJECTS } from "./academics";
import { CONSENTS } from "./compliance";
import { COURSE_SPACES } from "./courses";
import { OUTCOMES } from "./curriculum";
import { GUARDIAN_RELATIONSHIPS } from "./families";
import { TENANT } from "./ids";
import { ENROLMENTS, LEARNERS } from "./learner-records";
import * as L from "./library";
import { FEE_INVOICES } from "./ops-fees";
import { PEOPLE } from "./people";
import { ONLINE_TESTS, QUESTION_ITEMS, TEST_ATTEMPTS } from "./question-tests";
import { ROLE_PROFILES } from "./role-profiles";
import * as S from "./session-courses";
import { CAMPUSES, DEMO_TENANTS, INSTITUTIONS } from "./tenants";
import * as P from "./test-prep";

type TenantRow = { tenantId: string; id?: string };
type Reference = { tenantId: string; id: string };
type Parser = { safeParse(value: unknown): { error?: unknown } };

const sets: [string, Parser, readonly TenantRow[]][] = [
  ["catalogue records", C.CatalogueRecordSchema, L.CATALOGUE_RECORDS],
  ["library copies", C.LibraryCopySchema, L.LIBRARY_COPIES],
  ["library loans", C.LoanSchema, L.LIBRARY_LOANS],
  ["library holds", C.HoldSchema, L.LIBRARY_HOLDS],
  ["library fines", C.LibraryFineSchema, L.LIBRARY_FINES],
  ["reading recommendations", C.ReadingRecommendationSchema, L.READING_RECOMMENDATIONS],
  ["test series", C.TestSeriesSchema, P.TEST_SERIES_ROWS],
  ["test ranks", C.TestRankSchema, P.TEST_RANKS],
  ["doubts", C.DoubtSchema, P.DOUBTS],
  ["doubt answers", C.DoubtAnswerSchema, P.DOUBT_ANSWERS],
  ["weak topic plans", C.WeakTopicPlanSchema, P.WEAK_TOPIC_PLANS],
  ["parent reports", C.ParentReportSchema, P.PARENT_REPORTS],
  ["catalogue courses", C.CatalogueCourseSchema, S.CATALOGUE_COURSES],
  ["session packs", C.SessionPackSchema, S.SESSION_PACKS],
  ["pack purchases", C.PackPurchaseSchema, S.PACK_PURCHASES],
  ["class sessions", C.ClassSessionSchema, S.CLASS_SESSIONS],
  ["session bookings", C.SessionBookingSchema, S.SESSION_BOOKINGS],
  ["level exams", C.LevelExamSchema, S.LEVEL_EXAMS],
  ["practice media", C.MediaItemSchema, S.HARMONY_PRACTICE_MEDIA],
  ["practice feedback", C.PracticeFeedbackSchema, S.PRACTICE_FEEDBACK],
];

const staff = ROLE_PROFILES.filter((row) => row.kind === "staff");

function ref<T extends Reference>(rows: readonly T[], id: string | null, tenantId: string): T {
  const row = rows.find((candidate) => candidate.id === id && candidate.tenantId === tenantId);
  if (!row) throw new Error("Missing fixture reference " + id + " in " + tenantId);
  return row;
}

function learnerByProfile(profile: Reference) {
  const learner = LEARNERS.find(
    (row) => row.roleProfileId === profile.id && row.tenantId === profile.tenantId,
  );
  if (!learner) throw new Error("Missing learner for profile " + profile.id);
  return learner;
}

function expectAiConsent(learner: C.Learner, at: string) {
  const { tenantId, personId } = learner;
  if (!ref(PEOPLE, personId, tenantId).isMinor) return;
  const consent = CONSENTS.find(
    (row) =>
      row.tenantId === tenantId &&
      row.personId === personId &&
      row.purpose === "ai_features" &&
      row.status === "granted" &&
      row.recordedAt <= at &&
      row.withdrawnAt === null,
  );
  if (!consent) throw new Error("Missing AI consent for " + learner.id);
  const guardian = consent.givenByPersonId;
  ref(PEOPLE, guardian, tenantId);
  expect(
    GUARDIAN_RELATIONSHIPS.some(
      (row) =>
        row.tenantId === tenantId &&
        row.learnerPersonId === personId &&
        row.guardianPersonId === guardian &&
        row.parentalResponsibility,
    ),
  ).toBe(true);
}

function unique(keys: readonly string[]) {
  expect(new Set(keys).size).toBe(keys.length);
}

function covers<T, K extends keyof T>(rows: readonly T[], key: K, expected: readonly T[K][]) {
  expect(new Set(rows.map((row) => row[key]))).toEqual(new Set(expected));
}

it.each(sets)("%s parse and have unique IDs", (name, schema, rows) => {
  expect(rows.length).toBeGreaterThan(0);
  unique(rows.flatMap((row) => (row.id ? [row.id] : [])));
  for (const row of rows) {
    expect(DEMO_TENANTS.some((tenant) => tenant.tenantId === row.tenantId)).toBe(true);
    expect(schema.safeParse(row).error, row.id ?? name).toBeUndefined();
  }
});

it("covers the statuses and kinds used by the three modules", () => {
  covers(L.LIBRARY_COPIES, "status", C.LibraryCopyStatusSchema.options);
  covers(L.LIBRARY_LOANS, "status", C.LoanStatusSchema.options);
  covers(L.LIBRARY_HOLDS, "status", C.HoldStatusSchema.options);
  covers(L.LIBRARY_FINES, "status", C.LibraryFineStatusSchema.options);
  covers(P.TEST_SERIES_ROWS, "status", ["draft", "active", "completed"]);
  covers(P.DOUBTS, "status", C.DoubtStatusSchema.options);
  covers(P.DOUBT_ANSWERS, "kind", ["ai", "staff"]);
  covers(P.WEAK_TOPIC_PLANS, "status", ["draft", "shared"]);
  covers(P.PARENT_REPORTS, "status", ["draft", "sent"]);
  covers(S.CATALOGUE_COURSES, "status", ["draft", "active", "retired"]);
  covers(S.PACK_PURCHASES, "status", C.PackPurchaseStatusSchema.options);
  covers(S.CLASS_SESSIONS, "status", ["scheduled", "done", "cancelled"]);
  covers(S.CLASS_SESSIONS, "kind", C.ClassSessionKindSchema.options);
  covers(S.SESSION_BOOKINGS, "status", C.SessionBookingStatusSchema.options);
  covers(S.LEVEL_EXAMS, "result", C.LevelExamResultSchema.options);
  covers(S.PRACTICE_FEEDBACK, "status", ["draft", "shared"]);
  unique([...L.LIBRARY_LOANS, ...P.DOUBTS, ...S.SESSION_BOOKINGS].map((row) => row.clientId));
  unique(L.READING_RECOMMENDATIONS.map((r) => r.borrowerProfileId + ":" + r.recordId));
  unique(P.TEST_RANKS.map((r) => [r.seriesId, r.testId, r.learnerId].join(":")));
});

it("keeps library circulation, invoices and private reading history within each branch", () => {
  for (const row of L.CATALOGUE_RECORDS) {
    ref(INSTITUTIONS, row.institutionId, row.tenantId);
    if (row.confirmedByStaffProfileId) ref(staff, row.confirmedByStaffProfileId, row.tenantId);
  }
  expect(L.CATALOGUE_RECORDS.some((row) => row.source === "ai_photo")).toBe(true);
  covers(L.CATALOGUE_RECORDS, "tenantId", [TENANT.riverside, TENANT.northbridge]);
  for (const row of L.LIBRARY_COPIES) {
    const record = ref(L.CATALOGUE_RECORDS, row.recordId, row.tenantId);
    if (row.campusId) {
      expect(ref(CAMPUSES, row.campusId, row.tenantId).institutionId).toBe(record.institutionId);
    }
  }
  for (const row of L.LIBRARY_LOANS) {
    ref(L.LIBRARY_COPIES, row.copyId, row.tenantId);
    ref(staff, row.issuedByStaffProfileId, row.tenantId);
    const borrower = ref(ROLE_PROFILES, row.borrowerProfileId, row.tenantId);
    expect(borrower.kind).toBe(row.borrowerKind);
    if (borrower.kind === "learner") learnerByProfile(borrower);
  }
  for (const row of L.LIBRARY_HOLDS) {
    ref(L.CATALOGUE_RECORDS, row.recordId, row.tenantId);
    const borrower = ref(ROLE_PROFILES, row.borrowerProfileId, row.tenantId);
    if (borrower.kind === "learner") learnerByProfile(borrower);
  }
  for (const row of L.LIBRARY_FINES) {
    const loan = ref(L.LIBRARY_LOANS, row.loanId, row.tenantId);
    const borrower = ref(ROLE_PROFILES, row.borrowerProfileId, row.tenantId);
    expect(loan.borrowerProfileId).toBe(borrower.id);
    expect(ref(PEOPLE, borrower.personId, row.tenantId).isMinor).toBe(false);
    if (row.waivedByStaffProfileId) ref(staff, row.waivedByStaffProfileId, row.tenantId);
    if (row.feeInvoiceId) {
      expect(ref(FEE_INVOICES, row.feeInvoiceId, row.tenantId).learnerId).toBe(
        learnerByProfile(borrower).id,
      );
    }
  }
  for (const row of L.READING_RECOMMENDATIONS) {
    const { tenantId, borrowerProfileId, recordId } = row;
    const borrower = ref(ROLE_PROFILES, borrowerProfileId, tenantId);
    expectAiConsent(learnerByProfile(borrower), row.createdAt);
    const record = ref(L.CATALOGUE_RECORDS, recordId, tenantId);
    const ownReturnedLoans = L.LIBRARY_LOANS.filter(
      (l) => l.tenantId === tenantId && l.borrowerProfileId === borrowerProfileId && l.returnedAt,
    );
    expect(
      ownReturnedLoans.some((loan) => {
        const copy = ref(L.LIBRARY_COPIES, loan.copyId, tenantId);
        const prior = ref(L.CATALOGUE_RECORDS, copy.recordId, tenantId);
        const related = prior.subjects.some((subject) => record.subjects.includes(subject));
        return row.reason.includes(prior.title) && related;
      }),
    ).toBe(true);
  }
});

it("links Apex ranks, citations, plans and family reports to the correct batch", () => {
  const tenantId = TENANT.apex;
  for (const row of P.TEST_SERIES_ROWS) {
    expect(row.tenantId).toBe(tenantId);
    ref(INSTITUTIONS, row.institutionId, tenantId);
    for (const id of row.testIds) ref(ONLINE_TESTS, id, tenantId);
    for (const id of row.classGroupIds) ref(CLASS_GROUPS, id, tenantId);
  }
  for (const row of P.TEST_RANKS) {
    const series = ref(P.TEST_SERIES_ROWS, row.seriesId, row.tenantId);
    const test = ref(ONLINE_TESTS, row.testId, row.tenantId);
    const learner = ref(LEARNERS, row.learnerId, row.tenantId);
    expect(series.testIds).toContain(test.id);
    const scores = row.sectionScores;
    const sectionIds = test.sections.map((section) => section.id);
    covers(scores, "sectionId", sectionIds);
    expect(scores.reduce((n, score) => n + score.scorePoints, 0)).toBe(row.scorePoints);
    expect(scores.reduce((n, score) => n + score.maxPoints, 0)).toBe(row.maxPoints);
    const attempt = TEST_ATTEMPTS.find(
      (a) => a.tenantId === row.tenantId && a.testId === test.id && a.learnerId === learner.id,
    );
    expect(attempt).toMatchObject({ scorePoints: row.scorePoints, maxPoints: row.maxPoints });
    expect(Object.keys(row).filter((key) => /name/i.test(key))).toEqual([]);
  }
  for (const row of P.DOUBTS) {
    ref(LEARNERS, row.learnerId, row.tenantId);
    if (row.courseSpaceId) ref(COURSE_SPACES, row.courseSpaceId, row.tenantId);
    if (row.questionItemId) ref(QUESTION_ITEMS, row.questionItemId, row.tenantId);
    if (row.subjectId) ref(SUBJECTS, row.subjectId, row.tenantId);
  }
  for (const row of P.DOUBT_ANSWERS) {
    const doubt = ref(P.DOUBTS, row.doubtId, row.tenantId);
    if (row.answeredByStaffProfileId) ref(staff, row.answeredByStaffProfileId, row.tenantId);
    if (row.verifiedByStaffProfileId) ref(staff, row.verifiedByStaffProfileId, row.tenantId);
    if (row.kind !== "ai") continue;
    const { learnerId } = doubt;
    expectAiConsent(ref(LEARNERS, learnerId, tenantId), row.createdAt);
    const batch = ENROLMENTS.find((e) => e.tenantId === tenantId && e.learnerId === learnerId);
    const classGroupId = batch?.classGroupId ?? "";
    const series = P.TEST_SERIES_ROWS.filter((s) => s.classGroupIds.includes(classGroupId));
    const testIds = series.flatMap((s) => s.testIds);
    const batchTests = testIds.map((id) => ref(ONLINE_TESTS, id, tenantId));
    const batchQuestions = batchTests.flatMap((test) => test.sections.flatMap((s) => s.itemIds));
    for (const source of row.sources) {
      expect(source).toMatchObject({ moduleId: "M33", recordType: "questionItem" });
      expect(source.recordId).toBe(doubt.questionItemId);
      expect(batchQuestions).toContain(ref(QUESTION_ITEMS, source.recordId, row.tenantId).id);
    }
  }
  for (const row of [...P.WEAK_TOPIC_PLANS, ...P.PARENT_REPORTS]) {
    const learner = ref(LEARNERS, row.learnerId, row.tenantId);
    ref(P.TEST_SERIES_ROWS, row.seriesId, row.tenantId);
    if ("topics" in row) {
      expectAiConsent(learner, row.createdAt);
      for (const topic of row.topics) ref(OUTCOMES, topic.outcomeId, row.tenantId);
      if (row.sharedByStaffProfileId) ref(staff, row.sharedByStaffProfileId, row.tenantId);
    } else {
      if (row.sentByStaffProfileId) ref(staff, row.sentByStaffProfileId, row.tenantId);
      const guardian = GUARDIAN_RELATIONSHIPS.find(
        (link) => link.tenantId === row.tenantId && link.learnerPersonId === learner.personId,
      );
      ref(PEOPLE, guardian?.guardianPersonId ?? null, row.tenantId);
    }
  }
});

it("links Harmony packs and bookings while respecting session capacity", () => {
  for (const row of S.CATALOGUE_COURSES) {
    expect(row.tenantId).toBe(TENANT.harmony);
    ref(INSTITUTIONS, row.institutionId, row.tenantId);
    ref(PROGRAMS, row.programId, row.tenantId);
  }
  for (const row of S.SESSION_PACKS) ref(S.CATALOGUE_COURSES, row.courseId, row.tenantId);
  for (const row of S.PACK_PURCHASES) {
    ref(S.SESSION_PACKS, row.packId, row.tenantId);
    ref(LEARNERS, row.learnerId, row.tenantId);
    if (row.feeInvoiceId) {
      expect(ref(FEE_INVOICES, row.feeInvoiceId, row.tenantId).learnerId).toBe(row.learnerId);
    }
  }
  for (const row of S.CLASS_SESSIONS) {
    ref(staff, row.staffProfileId, row.tenantId);
    ref(S.CATALOGUE_COURSES, row.courseId, row.tenantId);
    const booked = S.SESSION_BOOKINGS.filter(
      (b) => b.sessionId === row.id && !b.status.startsWith("cancelled_"),
    );
    expect(booked.length).toBeLessThanOrEqual(row.capacity);
  }
  for (const row of S.SESSION_BOOKINGS) {
    const session = ref(S.CLASS_SESSIONS, row.sessionId, row.tenantId);
    const purchase = ref(S.PACK_PURCHASES, row.purchaseId, row.tenantId);
    expect(purchase.learnerId).toBe(row.learnerId);
    expect(ref(S.SESSION_PACKS, purchase.packId, row.tenantId).courseId).toBe(session.courseId);
    if (row.makeUpForBookingId) {
      const missed = ref(S.SESSION_BOOKINGS, row.makeUpForBookingId, row.tenantId);
      expect(missed.learnerId).toBe(row.learnerId);
      expect(missed.status).toBe("no_show");
      expect(session.kind).toBe("make_up");
    }
  }
  for (const row of S.LEVEL_EXAMS) {
    ref(S.CATALOGUE_COURSES, row.courseId, row.tenantId);
    ref(LEARNERS, row.learnerId, row.tenantId);
    if (row.examinerStaffProfileId) ref(staff, row.examinerStaffProfileId, row.tenantId);
  }
  for (const row of S.PRACTICE_FEEDBACK) {
    ref(S.CATALOGUE_COURSES, row.courseId, row.tenantId);
    const learner = ref(LEARNERS, row.learnerId, row.tenantId);
    const media = ref(S.HARMONY_PRACTICE_MEDIA, row.mediaItemId, row.tenantId);
    ref(INSTITUTIONS, media.institutionId, media.tenantId);
    ref(staff, media.uploadedByProfileId, media.tenantId);
    expect(media).toMatchObject({ visibility: "staff_only", taggedLearnerIds: [learner.id] });
    expect(["audio", "video"]).toContain(media.kind);
    expect(ref(PEOPLE, learner.personId, row.tenantId).isMinor).toBe(false);
    if (row.sharedByStaffProfileId) ref(staff, row.sharedByStaffProfileId, row.tenantId);
  }
});
