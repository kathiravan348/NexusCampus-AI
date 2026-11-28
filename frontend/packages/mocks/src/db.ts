import * as F from "./fixtures";
import { CONTENT_ASSETS, CONTENT_ATTEMPTS, CONTENT_ITEMS } from "./fixtures/content";
import {
  COURSE_ITEMS,
  COURSE_MODULES,
  COURSE_PROGRESS,
  COURSE_SPACES,
  DISCUSSION_POSTS,
  DISCUSSION_THREADS,
} from "./fixtures/courses";
import {
  COVERAGE_ENTRIES,
  LESSON_PLANS,
  OUTCOME_FRAMEWORKS,
  OUTCOME_MAPPINGS,
  OUTCOMES,
  SYLLABUS_UNITS,
} from "./fixtures/curriculum";
import { demoAccessFixtures } from "./fixtures/stage3-access";
import { stage4AccessFixtures } from "./fixtures/stage4-access";

/** A mutable deep copy, so screen tasks' write handlers can change rows without touching the fixtures. */
function clone<T>(items: readonly T[]): T[] {
  return structuredClone(items) as T[];
}

function createDb() {
  const access = demoAccessFixtures();
  const stage4 = stage4AccessFixtures();
  const stage4Grants = new Map(stage4.roles.map((role) => [role.id, role.permissions]));
  const roles = access.roles.map((role) => ({
    ...role,
    permissions: [...role.permissions, ...(stage4Grants.get(role.id) ?? [])],
  }));
  return {
    groups: clone(F.GROUPS),
    institutions: clone(F.INSTITUTIONS),
    campuses: clone(F.CAMPUSES),
    typeProfiles: clone(F.INSTITUTION_TYPE_PROFILES),
    calendars: clone(F.ACADEMIC_CALENDARS),
    people: clone(F.PEOPLE),
    roleProfiles: clone(F.ROLE_PROFILES),
    guardianLinks: clone(F.GUARDIAN_LINKS),
    users: clone(F.USERS),
    sessions: clone(F.SESSIONS),
    ssoProviders: clone(F.SSO_PROVIDERS),
    permissions: clone([...access.permissions, ...stage4.permissions]),
    roles: clone(roles),
    roleAssignments: clone(F.ROLE_ASSIGNMENTS),
    demoTenants: clone(F.DEMO_TENANTS),
    demoPersonas: clone(F.DEMO_PERSONAS),
    fonts: clone(F.FONTS),
    themes: clone(F.THEMES),
    textOverrides: clone(F.TEXT_OVERRIDES),
    textOverrideRevisions: clone(F.TEXT_OVERRIDE_REVISIONS),
    plans: clone(F.PLANS),
    tenantPlans: { ...F.TENANT_PLANS } as Record<string, string>,
    entitlements: clone([
      ...access.entitlements,
      ...stage4.entitlements,
      ...F.INSTALL_ENTITLEMENTS,
    ]),
    installs: structuredClone(F.INSTALLS) as Record<string, F.DemoInstall>,
    usageMeters: clone(F.USAGE_METERS),
    auditEvents: clone(F.AUDIT_EVENTS),
    consents: clone(F.CONSENTS),
    dataRequests: clone(F.DATA_SUBJECT_REQUESTS),
    compliancePacks: clone(F.COMPLIANCE_PACKS),
    tenantCompliance: structuredClone(F.TENANT_COMPLIANCE) as Record<string, string[]>,
    notificationTemplates: clone(F.NOTIFICATION_TEMPLATES),
    notificationDeliveries: clone(F.NOTIFICATION_DELIVERIES),
    notificationPreferences: clone(F.NOTIFICATION_PREFERENCES),
    devices: clone(F.DEVICE_SYNCS),
    syncConflicts: clone(F.SYNC_CONFLICTS),
    aiSettings: clone(F.AI_SETTINGS),
    aiCredits: clone(F.AI_CREDITS),
    keyStatuses: clone(F.KEY_STATUSES),
    accessRequests: clone(F.ACCESS_REQUESTS),
    accessGrants: clone(F.ACCESS_GRANTS),
    breakGlassNotices: clone(F.BREAK_GLASS_NOTICES),
    programs: clone(F.PROGRAMS),
    yearLevels: clone(F.YEAR_LEVELS),
    classGroups: clone(F.CLASS_GROUPS),
    subjects: clone(F.SUBJECTS),
    subjectOfferings: clone(F.SUBJECT_OFFERINGS),
    learners: clone(F.LEARNERS),
    enrolments: clone(F.ENROLMENTS),
    learnerDocuments: clone(F.LEARNER_DOCUMENTS),
    households: clone(F.HOUSEHOLDS),
    guardianRelationships: clone(F.GUARDIAN_RELATIONSHIPS),
    authorisedPickups: clone(F.AUTHORISED_PICKUPS),
    customFieldDefinitions: clone(F.CUSTOM_FIELD_DEFINITIONS),
    formDefinitions: clone(F.FORM_DEFINITIONS),
    workflowDefinitions: clone(F.WORKFLOW_DEFINITIONS),
    numberingFormats: clone(F.NUMBERING_FORMATS),
    enquiries: clone(F.ENQUIRIES),
    applications: clone(F.APPLICATIONS),
    admissionOffers: clone(F.ADMISSION_OFFERS),
    waitlistEntries: clone(F.WAITLIST_ENTRIES),
    importJobs: clone(F.IMPORT_JOBS),
    columnMappings: clone(F.COLUMN_MAPPINGS),
    importRowIssues: Object.fromEntries(
      Object.entries(F.IMPORT_ROW_ISSUES).map(([jobId, issues]) => [jobId, clone(issues)]),
    ),
    dryRunReports: clone(F.DRY_RUN_REPORTS),
    rolloverRuns: clone(F.ROLLOVER_RUNS),
    promotionDecisions: clone(F.PROMOTION_DECISIONS),
    rooms: clone(F.ROOMS),
    bellSchedules: clone(F.BELL_SCHEDULES),
    timetableSlots: clone(F.TIMETABLE_SLOTS),
    attendanceSessions: clone(F.ATTENDANCE_SESSIONS),
    attendanceMarks: clone(F.ATTENDANCE_MARKS),
    leaveRequests: clone(F.LEAVE_REQUESTS),
    feeHeads: clone(F.FEE_HEADS),
    feePlans: clone(F.FEE_PLANS),
    concessions: clone(F.CONCESSIONS),
    feeInvoices: clone(F.FEE_INVOICES),
    feePayments: clone(F.FEE_PAYMENTS),
    feeRefunds: clone(F.FEE_REFUNDS),
    ledgerAccounts: clone(F.LEDGER_ACCOUNTS),
    journalEntries: clone(F.JOURNAL_ENTRIES),
    budgets: clone(F.BUDGETS),
    gradingSchemes: clone(F.GRADING_SCHEMES),
    assessments: clone(F.ASSESSMENTS),
    rubrics: clone(F.RUBRICS),
    markEntries: clone(F.MARK_ENTRIES),
    exams: clone(F.EXAMS),
    examPapers: clone(F.EXAM_PAPERS),
    seatAssignments: clone(F.SEAT_ASSIGNMENTS),
    hallTickets: clone(F.HALL_TICKETS),
    revaluationRequests: clone(F.REVALUATION_REQUESTS),
    reportCards: clone(F.REPORT_CARDS),
    issuedDocuments: clone(F.ISSUED_DOCUMENTS),
    messageThreads: clone(F.MESSAGE_THREADS),
    threadMessages: clone(F.THREAD_MESSAGES),
    notices: clone(F.NOTICES),
    meetingSlots: clone(F.MEETING_SLOTS),
    meetingBookings: clone(F.MEETING_BOOKINGS),
    outcomeFrameworks: clone(OUTCOME_FRAMEWORKS),
    outcomes: clone(OUTCOMES),
    outcomeMappings: clone(OUTCOME_MAPPINGS),
    syllabusUnits: clone(SYLLABUS_UNITS),
    lessonPlans: clone(LESSON_PLANS),
    coverageEntries: clone(COVERAGE_ENTRIES),
    courseSpaces: clone(COURSE_SPACES),
    courseModules: clone(COURSE_MODULES),
    courseItems: clone(COURSE_ITEMS),
    courseProgress: clone(COURSE_PROGRESS),
    discussionThreads: clone(DISCUSSION_THREADS),
    discussionPosts: clone(DISCUSSION_POSTS),
    contentItems: clone(CONTENT_ITEMS),
    contentAssets: clone(CONTENT_ASSETS),
    contentAttempts: clone(CONTENT_ATTEMPTS),
  };
}

export type MockDb = ReturnType<typeof createDb>;

/** The in-memory mock database every handler reads. Tests call `resetMockDb()` between cases. */
export const mockDb: MockDb = createDb();

export function resetMockDb(): void {
  Object.assign(mockDb, createDb());
}
