import type { ConfigEntity, EnquiryStatus, FeeInvoiceStatus } from "@nexus/contracts";
import type { QueryKey } from "@tanstack/react-query";

/** Tenant + user every scoped key starts with, so one user's cache never serves another (O-3). */
export interface KeyScope {
  readonly tenantId: string;
  readonly userId: string;
}

const scoped = (s: KeyScope, ...rest: readonly unknown[]): QueryKey => [
  "t",
  s.tenantId,
  "u",
  s.userId,
  ...rest,
];

/** One factory for every query key; screens never write keys by hand. */
export const queryKeys = {
  /** Prefix of everything one user may see; invalidate it to refetch all. */
  scope: (s: KeyScope): QueryKey => scoped(s),
  /** Demo sign-in list: shown before anyone signs in, so it is the one key without a scope. */
  demoTenants: (): QueryKey => ["public", "m01", "demo-tenants"],
  m01: {
    tenant: (s: KeyScope) => scoped(s, "m01", "tenant"),
    institutionProfile: (s: KeyScope, institutionId: string) =>
      scoped(s, "m01", "institution-profile", institutionId),
    calendars: (s: KeyScope, institutionId: string) => scoped(s, "m01", "calendars", institutionId),
    localeSettings: (s: KeyScope, institutionId: string | null) =>
      scoped(s, "m01", "locale-settings", institutionId),
  },
  m02: {
    me: (s: KeyScope) => scoped(s, "m02", "me"),
    /** Prefix of every M02 list below; invalidated after each M02 write. */
    all: (s: KeyScope) => scoped(s, "m02"),
    people: (s: KeyScope) => scoped(s, "m02", "people"),
    users: (s: KeyScope) => scoped(s, "m02", "users"),
    roles: (s: KeyScope) => scoped(s, "m02", "roles"),
    permissions: (s: KeyScope) => scoped(s, "m02", "permissions"),
    assignments: (s: KeyScope) => scoped(s, "m02", "assignments"),
    sessions: (s: KeyScope) => scoped(s, "m02", "sessions"),
    ssoProviders: (s: KeyScope) => scoped(s, "m02", "sso-providers"),
  },
  m03: {
    theme: (s: KeyScope, campusId: string | null) => scoped(s, "m03", "theme", campusId),
    fonts: (s: KeyScope) => scoped(s, "m03", "fonts"),
  },
  m04: {
    textOverrides: (s: KeyScope, locale: string) => scoped(s, "m04", "text-overrides", locale),
    revisions: (s: KeyScope, key: string | null, locale: string | null = null) =>
      scoped(s, "m04", "revisions", key, locale),
  },
  m06: {
    /** Prefix of every M06 query below; invalidated after each M06 write. */
    all: (s: KeyScope) => scoped(s, "m06"),
    audit: (s: KeyScope, filters: unknown, page: number, pageSize: number) =>
      scoped(s, "m06", "audit", filters, page, pageSize),
    consents: (s: KeyScope) => scoped(s, "m06", "consents"),
    dataRequests: (s: KeyScope) => scoped(s, "m06", "data-requests"),
    compliancePacks: (s: KeyScope) => scoped(s, "m06", "compliance-packs"),
  },
  m08: {
    customFields: (s: KeyScope, entity: ConfigEntity | null) =>
      scoped(s, "m08", "custom-fields", entity),
    forms: (s: KeyScope) => scoped(s, "m08", "forms"),
    workflows: (s: KeyScope) => scoped(s, "m08", "workflows"),
    numberingFormats: (s: KeyScope) => scoped(s, "m08", "numbering-formats"),
  },
  m09: {
    importJobs: (s: KeyScope) => scoped(s, "m09", "import-jobs"),
    importJobMappings: (s: KeyScope, jobId: string | null) =>
      scoped(s, "m09", "import-jobs", jobId, "mappings"),
    importJobIssues: (s: KeyScope, jobId: string | null) =>
      scoped(s, "m09", "import-jobs", jobId, "issues"),
  },
  m10: {
    all: (s: KeyScope) => scoped(s, "m10"),
    devices: (s: KeyScope) => scoped(s, "m10", "devices"),
    conflicts: (s: KeyScope) => scoped(s, "m10", "conflicts"),
  },
  m11: {
    all: (s: KeyScope) => scoped(s, "m11"),
    settings: (s: KeyScope) => scoped(s, "m11", "settings"),
    credits: (s: KeyScope) => scoped(s, "m11", "credits"),
  },
  m12: {
    enquiries: (s: KeyScope, status: EnquiryStatus | null) => scoped(s, "m12", "enquiries", status),
    applications: (s: KeyScope) => scoped(s, "m12", "applications"),
    admissionOffers: (s: KeyScope) => scoped(s, "m12", "admission-offers"),
    waitlist: (s: KeyScope) => scoped(s, "m12", "waitlist"),
  },
  m13: {
    learners: (s: KeyScope) => scoped(s, "m13", "learners"),
    learner: (s: KeyScope, learnerId: string | null) => scoped(s, "m13", "learners", learnerId),
    learnerEnrolments: (s: KeyScope, learnerId: string | null) =>
      scoped(s, "m13", "learners", learnerId, "enrolments"),
    learnerDocuments: (s: KeyScope, learnerId: string | null) =>
      scoped(s, "m13", "learners", learnerId, "documents"),
  },
  m14: {
    households: (s: KeyScope) => scoped(s, "m14", "households"),
    guardianRelationships: (s: KeyScope, learnerPersonId: string | null) =>
      scoped(s, "m14", "guardian-relationships", learnerPersonId),
    authorisedPickups: (s: KeyScope, learnerPersonId: string | null) =>
      scoped(s, "m14", "authorised-pickups", learnerPersonId),
  },
  m15: {
    programs: (s: KeyScope) => scoped(s, "m15", "programs"),
    yearLevels: (s: KeyScope) => scoped(s, "m15", "year-levels"),
    classGroups: (s: KeyScope) => scoped(s, "m15", "class-groups"),
    subjects: (s: KeyScope) => scoped(s, "m15", "subjects"),
    subjectOfferings: (s: KeyScope, academicYearId: string | null) =>
      scoped(s, "m15", "subject-offerings", academicYearId),
  },
  m16: {
    rooms: (s: KeyScope) => scoped(s, "m16", "rooms"),
    bellSchedules: (s: KeyScope) => scoped(s, "m16", "bell-schedules"),
    timetableSlots: (s: KeyScope, classGroupId: string | null, staffProfileId: string | null) =>
      scoped(s, "m16", "timetable-slots", classGroupId, staffProfileId),
    teacherLoad: (s: KeyScope, academicYearId: string | null) =>
      scoped(s, "m16", "teacher-load", academicYearId),
  },
  m17: {
    attendanceSessions: (s: KeyScope, classGroupId: string | null) =>
      scoped(s, "m17", "attendance-sessions", classGroupId),
    attendanceRoster: (s: KeyScope, sessionId: string | null) =>
      scoped(s, "m17", "attendance-sessions", sessionId, "roster"),
    attendanceMarks: (s: KeyScope, sessionId: string | null) =>
      scoped(s, "m17", "attendance-sessions", sessionId, "marks"),
    leaveRequests: (s: KeyScope) => scoped(s, "m17", "leave-requests"),
  },
  m18: {
    feeHeads: (s: KeyScope) => scoped(s, "m18", "fee-heads"),
    feePlans: (s: KeyScope) => scoped(s, "m18", "fee-plans"),
    concessions: (s: KeyScope) => scoped(s, "m18", "concessions"),
    feeInvoices: (s: KeyScope, learnerId: string | null, status: FeeInvoiceStatus | null) =>
      scoped(s, "m18", "fee-invoices", learnerId, status),
    feePayments: (s: KeyScope, invoiceId: string | null) =>
      scoped(s, "m18", "fee-payments", invoiceId),
    feeRefunds: (s: KeyScope) => scoped(s, "m18", "fee-refunds"),
  },
  m19: {
    ledgerAccounts: (s: KeyScope) => scoped(s, "m19", "ledger-accounts"),
    journalEntries: (s: KeyScope) => scoped(s, "m19", "journal-entries"),
    budgets: (s: KeyScope) => scoped(s, "m19", "budgets"),
  },
  m20: {
    gradingSchemes: (s: KeyScope) => scoped(s, "m20", "grading-schemes"),
    assessments: (s: KeyScope, classGroupId: string | null) =>
      scoped(s, "m20", "assessments", classGroupId),
    rubrics: (s: KeyScope) => scoped(s, "m20", "rubrics"),
    assessmentRoster: (s: KeyScope, assessmentId: string | null) =>
      scoped(s, "m20", "assessments", assessmentId, "roster"),
    assessmentMarks: (s: KeyScope, assessmentId: string | null) =>
      scoped(s, "m20", "assessments", assessmentId, "marks"),
  },
  m21: {
    exams: (s: KeyScope) => scoped(s, "m21", "exams"),
    examPapers: (s: KeyScope, examId: string | null) => scoped(s, "m21", "exams", examId, "papers"),
    examSeats: (s: KeyScope, paperId: string | null) =>
      scoped(s, "m21", "exam-papers", paperId, "seats"),
    hallTickets: (s: KeyScope, learnerId: string | null) =>
      scoped(s, "m21", "hall-tickets", learnerId),
    revaluationRequests: (s: KeyScope) => scoped(s, "m21", "revaluation-requests"),
  },
  m22: {
    reportCards: (s: KeyScope, learnerId: string | null) =>
      scoped(s, "m22", "report-cards", learnerId),
  },
  m23: {
    issuedDocuments: (s: KeyScope, learnerId: string | null) =>
      scoped(s, "m23", "issued-documents", learnerId),
  },
  m24: {
    messageThreads: (s: KeyScope) => scoped(s, "m24", "message-threads"),
    threadMessages: (s: KeyScope, threadId: string | null) =>
      scoped(s, "m24", "message-threads", threadId, "messages"),
    notices: (s: KeyScope) => scoped(s, "m24", "notices"),
    meetingSlots: (s: KeyScope, staffProfileId: string | null) =>
      scoped(s, "m24", "meeting-slots", staffProfileId),
    meetingBookings: (s: KeyScope) => scoped(s, "m24", "meeting-bookings"),
  },
  m28: {
    roleHome: (s: KeyScope) => scoped(s, "m28", "me", "home"),
    dashboardKpis: (s: KeyScope) => scoped(s, "m28", "dashboards", "kpis"),
  },
  m29: {
    outcomeFrameworks: (s: KeyScope) => scoped(s, "m29", "outcome-frameworks"),
    outcomes: (s: KeyScope, frameworkId: string | null) =>
      scoped(s, "m29", "outcomes", frameworkId),
    outcomeMappings: (s: KeyScope, frameworkId: string | null) =>
      scoped(s, "m29", "outcome-mappings", frameworkId),
    syllabusUnits: (s: KeyScope, subjectId: string | null) =>
      scoped(s, "m29", "syllabus-units", subjectId),
    lessonPlans: (s: KeyScope, subjectOfferingId: string | null) =>
      scoped(s, "m29", "lesson-plans", subjectOfferingId),
    syllabusCoverage: (s: KeyScope, subjectOfferingId: string | null) =>
      scoped(s, "m29", "syllabus-coverage", subjectOfferingId),
  },
  m30: {
    courseSpaces: (s: KeyScope) => scoped(s, "m30", "course-spaces"),
    courseSpace: (s: KeyScope, courseSpaceId: string | null) =>
      scoped(s, "m30", "course-spaces", courseSpaceId),
    courseModules: (s: KeyScope, courseSpaceId: string | null) =>
      scoped(s, "m30", "course-spaces", courseSpaceId, "modules"),
    courseItems: (s: KeyScope, courseSpaceId: string | null) =>
      scoped(s, "m30", "course-spaces", courseSpaceId, "items"),
    courseProgress: (s: KeyScope, courseSpaceId: string | null) =>
      scoped(s, "m30", "course-spaces", courseSpaceId, "progress"),
    discussionThreads: (s: KeyScope, courseSpaceId: string | null) =>
      scoped(s, "m30", "course-spaces", courseSpaceId, "threads"),
    discussionPosts: (s: KeyScope, threadId: string | null) =>
      scoped(s, "m30", "threads", threadId, "posts"),
  },
  m31: {
    contentItems: (s: KeyScope) => scoped(s, "m31", "content-items"),
    contentItem: (s: KeyScope, contentItemId: string | null) =>
      scoped(s, "m31", "content-items", contentItemId),
    contentAssets: (s: KeyScope) => scoped(s, "m31", "content-assets"),
    contentAttempts: (s: KeyScope, contentItemId: string | null) =>
      scoped(s, "m31", "content-attempts", contentItemId),
  },
  m32: {
    assignments: (s: KeyScope, courseSpaceId: string | null) =>
      scoped(s, "m32", "assignments", "by-course-space", courseSpaceId),
    assignment: (s: KeyScope, assignmentId: string | null) =>
      scoped(s, "m32", "assignments", assignmentId),
    assignmentSubmissions: (s: KeyScope, assignmentId: string | null) =>
      scoped(s, "m32", "assignments", assignmentId, "submissions"),
    submissionFeedback: (s: KeyScope, submissionId: string | null) =>
      scoped(s, "m32", "submissions", submissionId, "feedback"),
    peerReviews: (s: KeyScope, submissionId: string | null) =>
      scoped(s, "m32", "submissions", submissionId, "peer-reviews"),
    originalitySignals: (s: KeyScope, submissionId: string | null) =>
      scoped(s, "m32", "submissions", submissionId, "originality"),
    aiMarkingSuggestions: (s: KeyScope, submissionId: string | null) =>
      scoped(s, "m32", "submissions", submissionId, "ai-suggestions"),
  },
  m33: {
    questionBanks: (s: KeyScope) => scoped(s, "m33", "question-banks"),
    questionItems: (s: KeyScope, bankId: string | null) =>
      scoped(s, "m33", "question-items", bankId),
    onlineTests: (s: KeyScope, courseSpaceId: string | null) =>
      scoped(s, "m33", "online-tests", "by-course-space", courseSpaceId),
    onlineTest: (s: KeyScope, testId: string | null) => scoped(s, "m33", "online-tests", testId),
    testAttempts: (s: KeyScope, testId: string | null) =>
      scoped(s, "m33", "online-tests", testId, "attempts"),
    testResponses: (s: KeyScope, attemptId: string | null) =>
      scoped(s, "m33", "attempts", attemptId, "responses"),
    itemStatistics: (s: KeyScope, testId: string | null) =>
      scoped(s, "m33", "online-tests", testId, "item-statistics"),
  },
  m83: {
    all: (s: KeyScope) => scoped(s, "m83"),
    keys: (s: KeyScope) => scoped(s, "m83", "keys"),
    requests: (s: KeyScope) => scoped(s, "m83", "requests"),
    grants: (s: KeyScope) => scoped(s, "m83", "grants"),
    breakGlass: (s: KeyScope) => scoped(s, "m83", "break-glass"),
    history: (s: KeyScope, grantId: string | null) => scoped(s, "m83", "history", grantId),
  },
  m84: {
    all: (s: KeyScope) => scoped(s, "m84"),
    status: (s: KeyScope) => scoped(s, "m84", "status"),
    update: (s: KeyScope) => scoped(s, "m84", "update"),
    backups: (s: KeyScope) => scoped(s, "m84", "backups"),
    diagnostics: (s: KeyScope) => scoped(s, "m84", "diagnostics"),
  },
  m86: {
    rolloverRuns: (s: KeyScope) => scoped(s, "m86", "rollover-runs"),
    rolloverDecisions: (s: KeyScope, runId: string | null) =>
      scoped(s, "m86", "rollover-runs", runId, "decisions"),
  },
  m07: {
    templates: (s: KeyScope) => scoped(s, "m07", "templates"),
    deliveries: (s: KeyScope, page: number, pageSize: number, filters: unknown) =>
      scoped(s, "m07", "deliveries", page, pageSize, filters),
    preferences: (s: KeyScope) => scoped(s, "m07", "preferences"),
  },
  m05: {
    plan: (s: KeyScope) => scoped(s, "m05", "plan"),
    entitlements: (s: KeyScope) => scoped(s, "m05", "entitlements"),
    usage: (s: KeyScope) => scoped(s, "m05", "usage"),
  },
} as const;
