import * as C from "@nexus/contracts";
import { describe, expect, it } from "vitest";
import * as F from "./index";

type TenantRow = { id: string; tenantId: string };
type Parser = { safeParse(value: unknown): { error?: unknown } };

const SETS: [string, Parser, readonly TenantRow[]][] = [
  ["ENQUIRIES", C.EnquirySchema, F.ENQUIRIES],
  ["APPLICATIONS", C.ApplicationSchema, F.APPLICATIONS],
  ["ADMISSION_OFFERS", C.AdmissionOfferSchema, F.ADMISSION_OFFERS],
  ["WAITLIST_ENTRIES", C.WaitlistEntrySchema, F.WAITLIST_ENTRIES],
  ["IMPORT_JOBS", C.ImportJobSchema, F.IMPORT_JOBS],
  ["ROLLOVER_RUNS", C.RolloverRunSchema, F.ROLLOVER_RUNS],
  ["PROMOTION_DECISIONS", C.PromotionDecisionSchema, F.PROMOTION_DECISIONS],
  ["ROOMS", C.RoomSchema, F.ROOMS],
  ["BELL_SCHEDULES", C.BellScheduleSchema, F.BELL_SCHEDULES],
  ["TIMETABLE_SLOTS", C.TimetableSlotSchema, F.TIMETABLE_SLOTS],
  ["ATTENDANCE_SESSIONS", C.AttendanceSessionSchema, F.ATTENDANCE_SESSIONS],
  ["ATTENDANCE_MARKS", C.AttendanceMarkSchema, F.ATTENDANCE_MARKS],
  ["LEAVE_REQUESTS", C.LeaveRequestSchema, F.LEAVE_REQUESTS],
  ["FEE_HEADS", C.FeeHeadSchema, F.FEE_HEADS],
  ["FEE_PLANS", C.FeePlanSchema, F.FEE_PLANS],
  ["CONCESSIONS", C.ConcessionSchema, F.CONCESSIONS],
  ["FEE_INVOICES", C.FeeInvoiceSchema, F.FEE_INVOICES],
  ["FEE_PAYMENTS", C.FeePaymentSchema, F.FEE_PAYMENTS],
  ["FEE_REFUNDS", C.FeeRefundSchema, F.FEE_REFUNDS],
  ["LEDGER_ACCOUNTS", C.LedgerAccountSchema, F.LEDGER_ACCOUNTS],
  ["JOURNAL_ENTRIES", C.JournalEntrySchema, F.JOURNAL_ENTRIES],
  ["BUDGETS", C.BudgetSchema, F.BUDGETS],
  ["GRADING_SCHEMES", C.GradingSchemeSchema, F.GRADING_SCHEMES],
  ["RUBRICS", C.RubricSchema, F.RUBRICS],
  ["ASSESSMENTS", C.AssessmentSchema, F.ASSESSMENTS],
  ["MARK_ENTRIES", C.MarkEntrySchema, F.MARK_ENTRIES],
  ["EXAMS", C.ExamSchema, F.EXAMS],
  ["EXAM_PAPERS", C.ExamPaperSchema, F.EXAM_PAPERS],
  ["SEAT_ASSIGNMENTS", C.SeatAssignmentSchema, F.SEAT_ASSIGNMENTS],
  ["HALL_TICKETS", C.HallTicketSchema, F.HALL_TICKETS],
  ["REVALUATION_REQUESTS", C.RevaluationRequestSchema, F.REVALUATION_REQUESTS],
  ["REPORT_CARDS", C.ReportCardSchema, F.REPORT_CARDS],
  ["ISSUED_DOCUMENTS", C.IssuedDocumentSchema, F.ISSUED_DOCUMENTS],
  ["MESSAGE_THREADS", C.MessageThreadSchema, F.MESSAGE_THREADS],
  ["THREAD_MESSAGES", C.ThreadMessageSchema, F.THREAD_MESSAGES],
  ["NOTICES", C.NoticeSchema, F.NOTICES],
  ["MEETING_SLOTS", C.MeetingSlotSchema, F.MEETING_SLOTS],
  ["MEETING_BOOKINGS", C.MeetingBookingSchema, F.MEETING_BOOKINGS],
];

const tenantIds = new Set(F.DEMO_TENANTS.map(({ tenantId }) => tenantId));
const staff = F.ROLE_PROFILES.filter(({ kind }) => kind === "staff");
const inTenant = <T extends { tenantId: string }>(rows: readonly T[], tenantId: string) =>
  rows.filter((row) => row.tenantId === tenantId);

function ref<T extends TenantRow>(
  rows: readonly T[],
  pool: readonly TenantRow[],
  pick: (row: T) => string | null | readonly string[],
) {
  for (const row of rows) {
    const val = pick(row);
    const ids: readonly string[] = typeof val === "string" ? [val] : val === null ? [] : val;
    for (const id of ids) expect(pool.find((p) => p.id === id)?.tenantId, id).toBe(row.tenantId);
  }
}

describe("Stage 3 operational fixtures (NEX-155, D16)", () => {
  it.each(SETS)("%s parse, have unique ids, and cover all demo tenants", (_n, schema, rows) => {
    expect(new Set(rows.map(({ tenantId }) => tenantId))).toEqual(tenantIds);
    expect(new Set(rows.map(({ id }) => id)).size).toBe(rows.length);
    for (const row of rows) expect(schema.safeParse(row).error, row.id).toBeUndefined();
  });

  it("resolve institution references across all institution-scoped sets", () => {
    const withInstitution: readonly (TenantRow & { institutionId: string })[] = [
      ...F.ENQUIRIES,
      ...F.APPLICATIONS,
      ...F.ROLLOVER_RUNS,
      ...F.ROOMS,
      ...F.BELL_SCHEDULES,
      ...F.ATTENDANCE_SESSIONS,
      ...F.FEE_HEADS,
      ...F.FEE_PLANS,
      ...F.LEDGER_ACCOUNTS,
      ...F.JOURNAL_ENTRIES,
      ...F.BUDGETS,
      ...F.GRADING_SCHEMES,
      ...F.EXAMS,
      ...F.MESSAGE_THREADS,
      ...F.NOTICES,
    ];
    ref(withInstitution, F.INSTITUTIONS, (r) => r.institutionId);
  });

  it("validate admissions, imports, row issues, and rollover runs", () => {
    for (const tenantId of tenantIds) {
      const enqs = inTenant(F.ENQUIRIES, tenantId);
      expect(enqs).toHaveLength(3);
      expect(enqs.some((e) => e.status === "lost")).toBe(true);
      expect(inTenant(F.APPLICATIONS, tenantId)).toHaveLength(2);
      const jobs = inTenant(F.IMPORT_JOBS, tenantId);
      expect(jobs.some((j) => j.status === "completed")).toBe(true);
      expect(jobs.some((j) => j.status === "dry_run_ready")).toBe(true);
      expect(inTenant(F.ROLLOVER_RUNS, tenantId).map((r) => r.status)).toEqual(["dry_run_ready"]);
    }
    ref(F.ENQUIRIES, F.CAMPUSES, (r) => r.campusId);
    ref(F.ENQUIRIES, F.PROGRAMS, (r) => r.programId);
    ref(F.ENQUIRIES, staff, (r) => r.assignedStaffProfileId);
    ref(F.APPLICATIONS, F.ENQUIRIES, (r) => r.enquiryId);
    ref(F.APPLICATIONS, F.FORM_DEFINITIONS, (r) => r.formId);
    ref(F.APPLICATIONS, F.ACADEMIC_CALENDARS, (r) => r.academicYearId);
    ref(F.APPLICATIONS, F.PROGRAMS, (r) => r.programId);
    ref(F.APPLICATIONS, F.YEAR_LEVELS, (r) => r.yearLevelId);
    ref(F.APPLICATIONS, F.PEOPLE, (r) => [r.applicantPersonId, ...r.guardianPersonIds]);
    ref(F.APPLICATIONS, F.LEARNER_DOCUMENTS, (r) => r.documentIds);
    ref(F.ADMISSION_OFFERS, F.APPLICATIONS, (r) => r.applicationId);
    ref(F.ADMISSION_OFFERS, F.CLASS_GROUPS, (r) => r.classGroupId);
    ref(F.WAITLIST_ENTRIES, F.APPLICATIONS, (r) => r.applicationId);
    ref(F.WAITLIST_ENTRIES, F.PROGRAMS, (r) => r.programId);
    ref(F.IMPORT_JOBS, staff, (r) => r.createdByStaffProfileId);
    const jobTenants = new Map(F.IMPORT_JOBS.map((j) => [j.id, j.tenantId]));
    expect(new Set(F.COLUMN_MAPPINGS.map((m) => m.jobId)).size).toBe(F.COLUMN_MAPPINGS.length);
    for (const m of F.COLUMN_MAPPINGS) {
      expect(C.ColumnMappingSchema.safeParse(m).error, m.jobId).toBeUndefined();
      expect(jobTenants.has(m.jobId)).toBe(true);
    }
    expect(new Set(F.COLUMN_MAPPINGS.map((m) => jobTenants.get(m.jobId)))).toEqual(tenantIds);
    const issueTenants = new Set<string>();
    for (const [jobId, issues] of Object.entries(F.IMPORT_ROW_ISSUES)) {
      const tenantId = jobTenants.get(jobId);
      expect(tenantId, jobId).toBeDefined();
      if (tenantId) issueTenants.add(tenantId);
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(C.ImportRowIssueSchema.safeParse(issue).error, jobId).toBeUndefined();
      }
    }
    expect(issueTenants).toEqual(tenantIds);
    for (const r of F.DRY_RUN_REPORTS) {
      expect(C.DryRunReportSchema.safeParse(r).error, r.jobId).toBeUndefined();
      expect(jobTenants.has(r.jobId)).toBe(true);
    }
    ref(F.ROLLOVER_RUNS, F.ACADEMIC_CALENDARS, (r) => r.fromAcademicYearId);
    ref(F.ROLLOVER_RUNS, staff, (r) => r.createdByStaffProfileId);
    ref(F.PROMOTION_DECISIONS, F.ROLLOVER_RUNS, (r) => r.runId);
    ref(F.PROMOTION_DECISIONS, F.LEARNERS, (r) => r.learnerId);
    ref(F.PROMOTION_DECISIONS, F.CLASS_GROUPS, (r) => r.toClassGroupId);
    ref(F.PROMOTION_DECISIONS, staff, (r) => r.overriddenByStaffProfileId);
    for (const run of F.ROLLOVER_RUNS) {
      const decisions = F.PROMOTION_DECISIONS.filter((d) => d.runId === run.id);
      expect(decisions).toHaveLength(inTenant(F.LEARNERS, run.tenantId).length);
      const totals = { promote: 0, detain: 0, graduate: 0, transfer: 0, skip: 0 };
      for (const d of decisions) totals[d.action] += 1;
      expect(run.counts).toEqual(totals);
    }
  });

  it("validate timetable slots without clashes and 5-day attendance", () => {
    ref(F.ROOMS, F.CAMPUSES, (r) => r.campusId);
    ref(F.TIMETABLE_SLOTS, F.ACADEMIC_CALENDARS, (r) => r.academicYearId);
    ref(F.TIMETABLE_SLOTS, F.SUBJECT_OFFERINGS, (r) => r.subjectOfferingId);
    ref(F.TIMETABLE_SLOTS, F.ROOMS, (r) => r.roomId);
    ref(F.TIMETABLE_SLOTS, staff, (r) => r.staffProfileIds);
    const groupSlots = new Map<string, number>();
    for (const s of F.TIMETABLE_SLOTS) {
      const off = F.SUBJECT_OFFERINGS.find((o) => o.id === s.subjectOfferingId);
      if (off) groupSlots.set(off.classGroupId, (groupSlots.get(off.classGroupId) ?? 0) + 1);
    }
    for (const g of F.CLASS_GROUPS) {
      expect(groupSlots.get(g.id) ?? 0, g.id).toBeGreaterThanOrEqual(3);
    }
    for (let i = 0; i < F.TIMETABLE_SLOTS.length; i += 1) {
      for (let j = i + 1; j < F.TIMETABLE_SLOTS.length; j += 1) {
        const a = F.TIMETABLE_SLOTS[i];
        const b = F.TIMETABLE_SLOTS[j];
        if (!a || !b || a.tenantId !== b.tenantId || a.weekday !== b.weekday) continue;
        if (!(a.start < b.end && b.start < a.end)) continue;
        if (a.roomId !== null && b.roomId !== null) expect(a.roomId).not.toBe(b.roomId);
        expect(a.staffProfileIds.some((id) => b.staffProfileIds.includes(id))).toBe(false);
      }
    }
    for (const tenantId of tenantIds) {
      expect(inTenant(F.ATTENDANCE_SESSIONS, tenantId)).toHaveLength(5);
      const marks = inTenant(F.ATTENDANCE_MARKS, tenantId);
      expect(marks.some((m) => m.status === "late")).toBe(true);
      expect(marks.some((m) => m.status === "absent")).toBe(true);
      expect(marks.some((m) => m.deviceId !== null)).toBe(true);
    }
    ref(F.ATTENDANCE_SESSIONS, F.CLASS_GROUPS, (r) => r.classGroupId);
    ref(F.ATTENDANCE_SESSIONS, staff, (r) => r.takenByStaffProfileId);
    for (const s of F.ATTENDANCE_SESSIONS) {
      const enrolled = F.ENROLMENTS.filter((e) => e.classGroupId === s.classGroupId);
      expect(F.ATTENDANCE_MARKS.filter((m) => m.sessionId === s.id)).toHaveLength(enrolled.length);
    }
    ref(F.ATTENDANCE_MARKS, F.ATTENDANCE_SESSIONS, (r) => r.sessionId);
    ref(F.ATTENDANCE_MARKS, F.LEARNERS, (r) => r.learnerId);
    ref(F.ATTENDANCE_MARKS, staff, (r) => r.markedByStaffProfileId);
    ref(F.ATTENDANCE_MARKS, F.DEVICE_SYNCS, (r) => r.deviceId);
    ref(F.LEAVE_REQUESTS, F.LEARNERS, (r) => r.learnerId);
    ref(F.LEAVE_REQUESTS, F.PEOPLE, (r) => r.requestedByPersonId);
    ref(F.LEAVE_REQUESTS, staff, (r) => r.decidedByStaffProfileId);
  });

  it("validate fees, accounting currencies, and payment totals", () => {
    const currencyOf = (t: string) => F.INSTITUTIONS.find((i) => i.tenantId === t)?.locale.currency;
    for (const tenantId of tenantIds) {
      const statuses = new Set(inTenant(F.FEE_INVOICES, tenantId).map((i) => i.status));
      expect(statuses).toEqual(new Set(["issued", "part_paid", "paid"]));
      expect(inTenant(F.FEE_REFUNDS, tenantId).some((r) => r.status === "requested")).toBe(true);
    }
    const priced = [
      ...F.FEE_PLANS,
      ...F.FEE_INVOICES,
      ...F.FEE_PAYMENTS,
      ...F.JOURNAL_ENTRIES,
      ...F.BUDGETS,
    ];
    for (const row of priced) expect(row.currency, row.id).toBe(currencyOf(row.tenantId));
    ref(F.FEE_PLANS, F.ACADEMIC_CALENDARS, (r) => r.academicYearId);
    ref(F.FEE_PLANS, F.PROGRAMS, (r) => r.programId);
    ref(F.FEE_PLANS, F.FEE_HEADS, (r) => r.lines.map((l) => l.feeHeadId));
    ref(F.CONCESSIONS, F.LEARNERS, (r) => r.learnerId);
    ref(F.CONCESSIONS, F.FEE_PLANS, (r) => r.feePlanId);
    ref(F.CONCESSIONS, staff, (r) => r.approvedByStaffProfileId);
    ref(F.FEE_INVOICES, F.LEARNERS, (r) => r.learnerId);
    ref(F.FEE_INVOICES, F.FEE_HEADS, (r) => r.lines.map((l) => l.feeHeadId));
    for (const inv of F.FEE_INVOICES) {
      const paid = F.FEE_PAYMENTS.filter(
        (p) => p.status === "succeeded" && p.invoiceIds.includes(inv.id),
      ).reduce((sum, p) => sum + p.amount, 0);
      expect(paid, inv.id).toBe(inv.paid);
    }
    ref(F.FEE_PAYMENTS, F.PEOPLE, (r) => r.payerPersonId);
    ref(F.FEE_PAYMENTS, F.FEE_INVOICES, (r) => r.invoiceIds);
    ref(F.FEE_REFUNDS, F.FEE_PAYMENTS, (r) => r.paymentId);
    ref(F.JOURNAL_ENTRIES, F.LEDGER_ACCOUNTS, (r) => r.lines.map((l) => l.accountId));
    ref(F.BUDGETS, F.ACADEMIC_CALENDARS, (r) => r.academicYearId);
    ref(F.BUDGETS, F.LEDGER_ACCOUNTS, (r) => r.lines.map((l) => l.accountId));
  });

  it("validate grading, exams, report cards, documents, and communication", () => {
    const schemeKind = (t: string) => F.GRADING_SCHEMES.find((s) => s.tenantId === t)?.kind;
    expect(schemeKind(F.TENANT.littleSteps)).toBe("descriptor");
    expect(schemeKind(F.TENANT.riverside)).toBe("letter");
    expect(schemeKind(F.TENANT.northbridge)).toBe("gpa");
    expect(F.MARK_ENTRIES.some((m) => m.absent)).toBe(true);
    expect(F.REPORT_CARDS.every((rc) => rc.status === "published")).toBe(true);
    expect(F.ISSUED_DOCUMENTS.some((d) => d.kind === "transfer" && d.signatures.length > 0)).toBe(
      true,
    );
    ref(F.ASSESSMENTS, F.SUBJECT_OFFERINGS, (r) => r.subjectOfferingId);
    ref(F.ASSESSMENTS, F.RUBRICS, (r) => r.rubricId);
    ref(F.MARK_ENTRIES, F.ASSESSMENTS, (r) => r.assessmentId);
    ref(F.MARK_ENTRIES, F.LEARNERS, (r) => r.learnerId);
    ref(F.MARK_ENTRIES, staff, (r) => r.enteredByStaffProfileId);
    ref(F.EXAMS, F.ACADEMIC_CALENDARS, (r) => r.academicYearId);
    ref(F.EXAM_PAPERS, F.EXAMS, (r) => r.examId);
    ref(F.EXAM_PAPERS, F.SUBJECT_OFFERINGS, (r) => r.subjectOfferingId);
    ref(F.EXAM_PAPERS, F.ROOMS, (r) => r.roomIds);
    ref(F.SEAT_ASSIGNMENTS, F.EXAM_PAPERS, (r) => r.examPaperId);
    ref(F.SEAT_ASSIGNMENTS, F.LEARNERS, (r) => r.learnerId);
    ref(F.SEAT_ASSIGNMENTS, F.ROOMS, (r) => r.roomId);
    ref(F.HALL_TICKETS, F.EXAMS, (r) => r.examId);
    ref(F.HALL_TICKETS, F.LEARNERS, (r) => r.learnerId);
    ref(F.REVALUATION_REQUESTS, F.EXAM_PAPERS, (r) => r.examPaperId);
    ref(F.REVALUATION_REQUESTS, F.LEARNERS, (r) => r.learnerId);
    ref(F.REPORT_CARDS, F.LEARNERS, (r) => r.learnerId);
    ref(F.REPORT_CARDS, F.ACADEMIC_CALENDARS, (r) => r.academicYearId);
    ref(F.REPORT_CARDS, F.SUBJECTS, (r) => r.lines.map((l) => l.subjectId));
    ref(F.ISSUED_DOCUMENTS, F.LEARNERS, (r) => r.learnerId);
    ref(F.ISSUED_DOCUMENTS, staff, (r) => r.signatures.map((s) => s.staffProfileId));
    for (const tenantId of tenantIds) {
      const threads = inTenant(F.MESSAGE_THREADS, tenantId);
      expect(new Set(threads.map((t) => t.kind))).toEqual(new Set(["class_group", "direct"]));
      const notices = inTenant(F.NOTICES, tenantId);
      expect(notices.some((n) => n.status === "published" && n.audience.kind === "everyone")).toBe(
        true,
      );
      expect(
        notices.some((n) => n.status === "scheduled" && n.audience.kind === "class_groups"),
      ).toBe(true);
    }
    ref(F.MESSAGE_THREADS, F.CLASS_GROUPS, (r) => r.classGroupId);
    ref(F.MESSAGE_THREADS, F.PEOPLE, (r) => r.participantPersonIds);
    ref(F.THREAD_MESSAGES, F.MESSAGE_THREADS, (r) => r.threadId);
    ref(F.THREAD_MESSAGES, F.PEOPLE, (r) => [r.senderPersonId, ...r.readByPersonIds]);
    ref(F.NOTICES, staff, (r) => r.createdByStaffProfileId);
    ref(F.NOTICES, F.CLASS_GROUPS, (r) =>
      r.audience.kind === "class_groups" ? r.audience.ids : [],
    );
    ref(F.MEETING_SLOTS, staff, (r) => r.staffProfileId);
    ref(F.MEETING_BOOKINGS, F.MEETING_SLOTS, (r) => r.slotId);
    ref(F.MEETING_BOOKINGS, F.PEOPLE, (r) => r.guardianPersonId);
    ref(F.MEETING_BOOKINGS, F.LEARNERS, (r) => r.learnerId);
  });
});
