/**
 * Stage 3 demo rows for the backend seed (NEX-195, D85). Same rows as the mock database; the seed seals personal
 * columns itself. The next academic year's calendar per tenant (the rollover fixtures' `toAcademicYearId`) exists
 * only here, so a real rollover dry run works on demo data.
 */
import type { AcademicCalendar } from "@nexus/contracts";
import { ACADEMIC_CALENDARS } from "./calendars";
import * as F from "./index";

function shiftYear(date: string): string {
  return `${Number(date.slice(0, 4)) + 1}${date.slice(4)}`;
}

/** One calendar per rollover target year, copied from the from-year one year later, without periods or holidays. */
function nextYearCalendars(): AcademicCalendar[] {
  const calendars: AcademicCalendar[] = [];
  for (const run of F.ROLLOVER_RUNS) {
    const from = ACADEMIC_CALENDARS.find((row) => row.id === run.fromAcademicYearId);
    if (!from || calendars.some((row) => row.id === run.toAcademicYearId)) continue;
    const startsOn = shiftYear(from.startsOn);
    const endsOn = shiftYear(from.endsOn);
    const first = Number(startsOn.slice(0, 4));
    const label =
      first === Number(endsOn.slice(0, 4)) ? `${first}` : `${first}-${String(first + 1).slice(2)}`;
    calendars.push({
      ...from,
      id: run.toAcademicYearId,
      academicYear: label,
      startsOn,
      endsOn,
      periods: [],
      holidays: [],
    });
  }
  return calendars;
}

export function stage3Fixtures() {
  return {
    nextYearCalendars: nextYearCalendars(),
    customFieldDefinitions: F.CUSTOM_FIELD_DEFINITIONS,
    formDefinitions: F.FORM_DEFINITIONS,
    workflowDefinitions: F.WORKFLOW_DEFINITIONS,
    numberingFormats: F.NUMBERING_FORMATS,
    programs: F.PROGRAMS,
    yearLevels: F.YEAR_LEVELS,
    classGroups: F.CLASS_GROUPS,
    subjects: F.SUBJECTS,
    subjectOfferings: F.SUBJECT_OFFERINGS,
    learners: F.LEARNERS,
    enrolments: F.ENROLMENTS,
    learnerDocuments: F.LEARNER_DOCUMENTS,
    households: F.HOUSEHOLDS,
    guardianRelationships: F.GUARDIAN_RELATIONSHIPS,
    authorisedPickups: F.AUTHORISED_PICKUPS,
    enquiries: F.ENQUIRIES,
    applications: F.APPLICATIONS,
    admissionOffers: F.ADMISSION_OFFERS,
    waitlistEntries: F.WAITLIST_ENTRIES,
    enquiryForms: F.PUBLIC_ENQUIRY_FORMS,
    importJobs: F.IMPORT_JOBS,
    columnMappings: F.COLUMN_MAPPINGS,
    importRowIssues: Object.entries(F.IMPORT_ROW_ISSUES).flatMap(([jobId, issues]) =>
      issues.map((issue, index) => ({ ...issue, id: `${jobId}-issue-${index + 1}`, jobId })),
    ),
    rooms: F.ROOMS,
    bellSchedules: F.BELL_SCHEDULES,
    timetableSlots: F.TIMETABLE_SLOTS,
    attendanceSessions: F.ATTENDANCE_SESSIONS,
    attendanceMarks: F.ATTENDANCE_MARKS,
    leaveRequests: F.LEAVE_REQUESTS,
    feeHeads: F.FEE_HEADS,
    feePlans: F.FEE_PLANS,
    concessions: F.CONCESSIONS,
    feeInvoices: F.FEE_INVOICES,
    feePayments: F.FEE_PAYMENTS,
    feeRefunds: F.FEE_REFUNDS,
    ledgerAccounts: F.LEDGER_ACCOUNTS,
    journalEntries: F.JOURNAL_ENTRIES,
    budgets: F.BUDGETS,
    gradingSchemes: F.GRADING_SCHEMES,
    rubrics: F.RUBRICS,
    assessments: F.ASSESSMENTS,
    markEntries: F.MARK_ENTRIES,
    exams: F.EXAMS,
    examPapers: F.EXAM_PAPERS,
    seatAssignments: F.SEAT_ASSIGNMENTS,
    hallTickets: F.HALL_TICKETS,
    revaluationRequests: F.REVALUATION_REQUESTS,
    reportCards: F.REPORT_CARDS,
    issuedDocuments: F.ISSUED_DOCUMENTS,
    messageThreads: F.MESSAGE_THREADS,
    threadMessages: F.THREAD_MESSAGES,
    notices: F.NOTICES,
    meetingSlots: F.MEETING_SLOTS,
    meetingBookings: F.MEETING_BOOKINGS,
    rolloverRuns: F.ROLLOVER_RUNS,
    promotionDecisions: F.PROMOTION_DECISIONS,
  };
}
