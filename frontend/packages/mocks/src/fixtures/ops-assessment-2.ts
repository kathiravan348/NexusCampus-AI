import type {
  Exam,
  ExamPaper,
  HallTicket,
  IssuedDocument,
  IssuedDocumentKind,
  ReportCard,
  RevaluationRequest,
  SeatAssignment,
} from "@nexus/contracts";
import { CLASS_GROUPS, SUBJECT_OFFERINGS } from "./academics";
import { ACADEMIC_CALENDARS } from "./calendars";
import { CALENDAR, INSTITUTION, PERSON, TENANT } from "./ids";
import {
  CLASS_GROUP,
  DOCUMENT_TEMPLATE,
  EXAM,
  EXAM_PAPER,
  hallTicketId,
  ISSUED_DOCUMENT,
  type OpsTenantSlug,
  REPORT_CARD,
  REPORT_TEMPLATE,
  REVALUATION_REQUEST,
  seatAssignmentId,
} from "./ids-stage3";
import { ENROLMENTS } from "./learner-records";
import { ROOMS } from "./ops-timetable";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

interface ExamTenantSpec {
  readonly slug: OpsTenantSlug;
  readonly prefix: string;
  readonly tenantId: string;
  readonly institutionId: string;
  readonly academicYearId: string;
  readonly adminPersonId: string;
  readonly primaryGroupId: string;
  readonly topGrade: string;
  readonly descriptorOnly: boolean;
  readonly documentKind: IssuedDocumentKind;
  readonly revaluationChanged: boolean;
}

const EXAM_SPECS: readonly ExamTenantSpec[] = [
  {
    slug: "ls",
    prefix: "LS",
    tenantId: TENANT.littleSteps,
    institutionId: INSTITUTION.littleSteps,
    academicYearId: CALENDAR.littleSteps,
    adminPersonId: PERSON.lsPriya,
    primaryGroupId: CLASS_GROUP.lsSeedlings,
    topGrade: "EX",
    descriptorOnly: true,
    documentKind: "bonafide",
    revaluationChanged: false,
  },
  {
    slug: "rv",
    prefix: "RV",
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
    academicYearId: CALENDAR.riversideSchool,
    adminPersonId: PERSON.rvHelen,
    primaryGroupId: CLASS_GROUP.rvSouthYearFive,
    topGrade: "A",
    descriptorOnly: false,
    documentKind: "transfer",
    revaluationChanged: true,
  },
  {
    slug: "nb",
    prefix: "NB",
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
    academicYearId: CALENDAR.northbridge,
    adminPersonId: PERSON.nbRobert,
    primaryGroupId: CLASS_GROUP.nbFirstYear,
    topGrade: "A",
    descriptorOnly: false,
    documentKind: "bonafide",
    revaluationChanged: false,
  },
  {
    slug: "ax",
    prefix: "AX",
    tenantId: TENANT.apex,
    institutionId: INSTITUTION.apex,
    academicYearId: CALENDAR.apex,
    adminPersonId: PERSON.axKarthik,
    primaryGroupId: CLASS_GROUP.axFoundation,
    topGrade: "TOP",
    descriptorOnly: false,
    documentKind: "bonafide",
    revaluationChanged: false,
  },
  {
    slug: "hm",
    prefix: "HM",
    tenantId: TENANT.harmony,
    institutionId: INSTITUTION.harmony,
    academicYearId: CALENDAR.harmony,
    adminPersonId: PERSON.hmWeiLing,
    primaryGroupId: CLASS_GROUP.hmBeginner,
    topGrade: "MST",
    descriptorOnly: false,
    documentKind: "bonafide",
    revaluationChanged: false,
  },
];

const built = EXAM_SPECS.map((spec) => {
  const { slug, prefix, tenantId, institutionId, academicYearId } = spec;
  const adminStaff = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === spec.adminPersonId && p.kind === "staff",
  );
  const calendar = ACADEMIC_CALENDARS.find((c) => c.id === academicYearId);
  const primaryGroup = CLASS_GROUPS.find((g) => g.id === spec.primaryGroupId);
  const [offOne, offTwo] = SUBJECT_OFFERINGS.filter((o) => o.classGroupId === spec.primaryGroupId);
  const primaryRoom = ROOMS.find(
    (r) => r.tenantId === tenantId && r.campusId === primaryGroup?.campusId,
  );
  const groupEnrolments = ENROLMENTS.filter((e) => e.classGroupId === spec.primaryGroupId);
  const primaryLearners = groupEnrolments.map((e) => e.learnerId);
  const firstLearner = primaryLearners[0];
  if (!adminStaff || !calendar || !offOne || !offTwo || !primaryRoom || !firstLearner) {
    throw new Error(`Incomplete exam references for ${tenantId}`);
  }

  const exam: Exam = {
    id: EXAM[slug],
    tenantId,
    institutionId,
    academicYearId,
    name: "Term Examination Series",
    startsOn: "2026-11-02",
    endsOn: "2026-11-06",
    status: "published",
    ...timestamps,
  };
  const examPaper: ExamPaper = {
    id: EXAM_PAPER[slug],
    tenantId,
    examId: exam.id,
    subjectOfferingId: offOne.id,
    date: "2026-11-03",
    start: "09:30",
    end: "11:00",
    roomIds: [primaryRoom.id],
    maxMarks: 100,
  };
  const seatAssignments: SeatAssignment[] = primaryLearners.map((learnerId, idx) => ({
    id: seatAssignmentId(examPaper.id, learnerId),
    tenantId,
    examPaperId: examPaper.id,
    learnerId,
    roomId: primaryRoom.id,
    seatLabel: `A${idx + 1}`,
  }));
  const hallTickets: HallTicket[] = primaryLearners.map((learnerId, idx) => ({
    id: hallTicketId(exam.id, learnerId),
    tenantId,
    examId: exam.id,
    learnerId,
    ticketNumber: `HT-${prefix}-2026-00${idx + 1}`,
    issuedAt: "2026-10-25T09:00:00Z",
    revoked: false,
  }));
  const revaluation: RevaluationRequest = {
    id: REVALUATION_REQUEST[slug],
    tenantId,
    examPaperId: examPaper.id,
    learnerId: firstLearner,
    reason: "Requested review of section two scoring.",
    status: spec.revaluationChanged ? "changed" : "in_review",
    oldMarks: 74,
    newMarks: spec.revaluationChanged ? 78 : null,
    createdAt: "2026-11-08T09:00:00Z",
    updatedAt: "2026-11-10T10:00:00Z",
  };
  const reportCard: ReportCard = {
    id: REPORT_CARD[slug],
    tenantId,
    learnerId: firstLearner,
    academicYearId,
    periodId: calendar.periods[0]?.id ?? null,
    templateId: REPORT_TEMPLATE[slug],
    lines: [
      {
        subjectId: offOne.subjectId,
        grade: spec.topGrade,
        marksPercent: spec.descriptorOnly ? null : 88,
        remark: "Strong participation in class work.",
      },
      {
        subjectId: offTwo.subjectId,
        grade: spec.topGrade,
        marksPercent: spec.descriptorOnly ? null : 85,
        remark: "Consistent preparation for sessions.",
      },
    ],
    overallRemark: "Positive engagement throughout the term.",
    status: "published",
    publishedAt: "2026-11-15T12:00:00Z",
    createdAt: "2026-11-12T09:00:00Z",
    updatedAt: "2026-11-15T12:00:00Z",
  };
  const issuedDocument: IssuedDocument = {
    id: ISSUED_DOCUMENT[slug],
    tenantId,
    learnerId: firstLearner,
    kind: spec.documentKind,
    number: `DOC-${prefix}-2026-0001`,
    templateId: DOCUMENT_TEMPLATE[slug],
    issuedOn: "2026-11-14",
    signatures: [
      {
        staffProfileId: adminStaff.id,
        signedAt: "2026-11-14T10:00:00Z",
        method: "digital_certificate",
      },
    ],
    verificationCode: `NX${prefix}20260001`,
    revoked: false,
    revokedReason: null,
  };
  return {
    exam,
    examPaper,
    seatAssignments,
    hallTickets,
    revaluation,
    reportCard,
    issuedDocument,
  };
});

export const EXAMS: readonly Exam[] = built.map((b) => b.exam);
export const EXAM_PAPERS: readonly ExamPaper[] = built.map((b) => b.examPaper);
export const SEAT_ASSIGNMENTS: readonly SeatAssignment[] = built.flatMap((b) => b.seatAssignments);
export const HALL_TICKETS: readonly HallTicket[] = built.flatMap((b) => b.hallTickets);
export const REVALUATION_REQUESTS: readonly RevaluationRequest[] = built.map((b) => b.revaluation);
export const REPORT_CARDS: readonly ReportCard[] = built.map((b) => b.reportCard);
export const ISSUED_DOCUMENTS: readonly IssuedDocument[] = built.map((b) => b.issuedDocument);
