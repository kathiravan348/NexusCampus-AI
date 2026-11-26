import * as C from "@nexus/contracts";
import type { z } from "zod";
import { AI_CREDITS, AI_SETTINGS, ASSIST_ANSWERS } from "./ai";
import { AUDIT_EVENTS } from "./audit";
import { ACADEMIC_CALENDARS } from "./calendars";
import { COMPLIANCE_PACKS, CONSENTS, DATA_SUBJECT_REQUESTS } from "./compliance";
import { SESSIONS, SSO_PROVIDERS, USERS } from "./identity";
import {
  NOTIFICATION_DELIVERIES,
  NOTIFICATION_PREFERENCES,
  NOTIFICATION_TEMPLATES,
} from "./notifications";
import { PEOPLE } from "./people";
import { ENTITLEMENTS, PLANS, USAGE_METERS } from "./plans";
import { INSTITUTION_TYPE_PROFILES } from "./profiles";
import { PERMISSIONS, ROLE_ASSIGNMENTS, ROLES } from "./rbac";
import { ROLE_PROFILES } from "./role-profiles";
import { FONTS, TEXT_OVERRIDE_REVISIONS, TEXT_OVERRIDES, THEMES } from "./studio";
import { DEVICE_SYNCS, SYNC_CONFLICTS } from "./sync";
import { CAMPUSES, GROUPS, INSTITUTIONS } from "./tenants";
import { INSTALLS } from "./install";
import { ACCESS_GRANTS, ACCESS_REQUESTS, BREAK_GLASS_NOTICES, KEY_STATUSES } from "./vault";
import * as F from "./index";

const DOMAIN_EVENT = {
  eventId: "evt-0001",
  tenantId: "ten-ls",
  moduleId: "M02",
  eventType: "m02.user.invited",
  occurredAt: "2026-09-01T08:00:00Z",
  actorId: "usr-ls-priya",
  correlationId: "corr-0001",
  schemaVersion: 1,
  payload: { userId: "usr-ls-new" },
};
const API_ERROR = {
  error: {
    code: "not_found",
    message: "Not found.",
    details: [{ path: "id", message: "Unknown id" }],
  },
};

/**
 * Contracts the backend serves, with demo rows as valid samples (NEX-059). The backend test maps each name to its
 * Pydantic model; `docs/CONTRACTS.md` names the rest "frontend only".
 */
const CONTRACTS: readonly (readonly [string, z.ZodType, readonly unknown[]])[] = [
  ["ApiError", C.ApiErrorSchema, [API_ERROR]],
  ["DomainEvent", C.DomainEventSchema, [DOMAIN_EVENT]],
  ["LocaleSettings", C.LocaleSettingsSchema, INSTITUTIONS.map((i) => i.locale)],
  ["Group", C.GroupSchema, GROUPS],
  ["Institution", C.InstitutionSchema, INSTITUTIONS],
  ["Campus", C.CampusSchema, CAMPUSES],
  ["InstitutionTypeProfile", C.InstitutionTypeProfileSchema, INSTITUTION_TYPE_PROFILES],
  ["AcademicCalendar", C.AcademicCalendarSchema, ACADEMIC_CALENDARS],
  ["Person", C.PersonSchema, PEOPLE],
  ["RoleProfile", C.RoleProfileSchema, ROLE_PROFILES],
  ["User", C.UserSchema, USERS],
  ["Session", C.SessionSchema, SESSIONS],
  ["SsoProvider", C.SsoProviderSchema, SSO_PROVIDERS],
  ["Permission", C.PermissionSchema, PERMISSIONS],
  ["Role", C.RoleSchema, ROLES],
  ["RoleAssignment", C.RoleAssignmentSchema, ROLE_ASSIGNMENTS],
  ["Theme", C.ThemeSchema, THEMES],
  ["Font", C.FontSchema, FONTS],
  ["TextOverride", C.TextOverrideSchema, TEXT_OVERRIDES],
  ["TextOverrideRevision", C.TextOverrideRevisionSchema, TEXT_OVERRIDE_REVISIONS],
  ["Plan", C.PlanSchema, PLANS],
  ["Entitlement", C.EntitlementSchema, ENTITLEMENTS],
  ["UsageMeter", C.UsageMeterSchema, USAGE_METERS],
  ["AuditEvent", C.AuditEventSchema, AUDIT_EVENTS],
  ["Consent", C.ConsentSchema, CONSENTS],
  ["DataSubjectRequest", C.DataSubjectRequestSchema, DATA_SUBJECT_REQUESTS],
  ["CompliancePack", C.CompliancePackSchema, COMPLIANCE_PACKS],
  ["NotificationTemplate", C.NotificationTemplateSchema, NOTIFICATION_TEMPLATES],
  ["NotificationDelivery", C.NotificationDeliverySchema, NOTIFICATION_DELIVERIES],
  ["NotificationPreference", C.NotificationPreferenceSchema, NOTIFICATION_PREFERENCES],
  ["DeviceSync", C.DeviceSyncSchema, DEVICE_SYNCS],
  ["SyncConflict", C.SyncConflictSchema, SYNC_CONFLICTS],
  ["AiSettings", C.AiSettingsSchema, AI_SETTINGS],
  ["AiCredit", C.AiCreditSchema, AI_CREDITS],
  ["AssistAnswer", C.AssistAnswerSchema, ASSIST_ANSWERS],
  ["KeyStatus", C.KeyStatusSchema, KEY_STATUSES],
  ["AccessRequest", C.AccessRequestSchema, ACCESS_REQUESTS],
  ["AccessGrant", C.AccessGrantSchema, ACCESS_GRANTS],
  ["BreakGlassNotice", C.BreakGlassNoticeSchema, BREAK_GLASS_NOTICES],
  [
    "DiagnosticBundle",
    C.DiagnosticBundleSchema,
    Object.values(INSTALLS).flatMap((i) => i.diagnostics),
  ],
  [
    "DiagnosticContent",
    C.DiagnosticContentSchema,
    Object.values(INSTALLS).flatMap((i) =>
      Object.entries(i.diagnosticContent).map(([id, content]) => ({ id, content })),
    ),
  ],
  // Stage 3 (NEX-196): every contract the backend serves, with its demo rows.
  ["CustomFieldDefinition", C.CustomFieldDefinitionSchema, F.CUSTOM_FIELD_DEFINITIONS],
  ["FormDefinition", C.FormDefinitionSchema, F.FORM_DEFINITIONS],
  ["WorkflowDefinition", C.WorkflowDefinitionSchema, F.WORKFLOW_DEFINITIONS],
  ["NumberingFormat", C.NumberingFormatSchema, F.NUMBERING_FORMATS],
  ["Program", C.ProgramSchema, F.PROGRAMS],
  ["YearLevel", C.YearLevelSchema, F.YEAR_LEVELS],
  ["ClassGroup", C.ClassGroupSchema, F.CLASS_GROUPS],
  ["Subject", C.SubjectSchema, F.SUBJECTS],
  ["SubjectOffering", C.SubjectOfferingSchema, F.SUBJECT_OFFERINGS],
  ["Learner", C.LearnerSchema, F.LEARNERS],
  ["Enrolment", C.EnrolmentSchema, F.ENROLMENTS],
  ["LearnerDocument", C.LearnerDocumentSchema, F.LEARNER_DOCUMENTS],
  ["Household", C.HouseholdSchema, F.HOUSEHOLDS],
  ["GuardianRelationshipView", C.GuardianRelationshipViewSchema, F.GUARDIAN_RELATIONSHIPS],
  ["AuthorisedPickup", C.AuthorisedPickupSchema, F.AUTHORISED_PICKUPS],
  ["Enquiry", C.EnquirySchema, F.ENQUIRIES],
  ["Application", C.ApplicationSchema, F.APPLICATIONS],
  ["AdmissionOffer", C.AdmissionOfferSchema, F.ADMISSION_OFFERS],
  ["WaitlistEntry", C.WaitlistEntrySchema, F.WAITLIST_ENTRIES],
  [
    "EnquiryFormSummary",
    C.EnquiryFormSummarySchema,
    F.PUBLIC_ENQUIRY_FORMS.map((form) => ({
      id: form.id,
      tenantId: form.tenantId,
      institutionId: form.institutionId,
      institutionName:
        INSTITUTIONS.find((row) => row.id === form.institutionId)?.name ?? "Institution",
    })),
  ],
  [
    "PublicEnquiryForm",
    C.PublicEnquiryFormSchema,
    [
      {
        id: "pef-sample0000001",
        institutionName: "Little Steps",
        institutionType: "ey",
        defaultLocale: "en-IN",
        supportedLocales: ["en-IN", "hi-IN"],
        programs: [{ id: "prg-1", name: "Nursery" }],
        campuses: [],
      },
    ],
  ],
  ["ImportJob", C.ImportJobSchema, F.IMPORT_JOBS],
  ["ColumnMapping", C.ColumnMappingSchema, F.COLUMN_MAPPINGS],
  ["ImportRowIssue", C.ImportRowIssueSchema, Object.values(F.IMPORT_ROW_ISSUES).flat()],
  ["Room", C.RoomSchema, F.ROOMS],
  ["BellSchedule", C.BellScheduleSchema, F.BELL_SCHEDULES],
  ["TimetableSlot", C.TimetableSlotSchema, F.TIMETABLE_SLOTS],
  [
    "TeacherLoad",
    C.TeacherLoadSchema,
    [
      {
        staffProfileId: "rp-1",
        academicYearId: "cal-1",
        periodId: null,
        weeklyPeriods: 3,
        weeklyMinutes: 135,
        maxWeeklyPeriods: null,
        overloaded: false,
      },
    ],
  ],
  ["AttendanceSession", C.AttendanceSessionSchema, F.ATTENDANCE_SESSIONS],
  ["AttendanceMark", C.AttendanceMarkSchema, F.ATTENDANCE_MARKS],
  [
    "AttendanceRosterEntry",
    C.AttendanceRosterEntrySchema,
    F.ENROLMENTS.map((row) => ({ learnerId: row.learnerId, rollNumber: row.rollNumber })),
  ],
  ["LeaveRequest", C.LeaveRequestSchema, F.LEAVE_REQUESTS],
  ["FeeHead", C.FeeHeadSchema, F.FEE_HEADS],
  ["FeePlan", C.FeePlanSchema, F.FEE_PLANS],
  ["Concession", C.ConcessionSchema, F.CONCESSIONS],
  ["FeeInvoice", C.FeeInvoiceSchema, F.FEE_INVOICES],
  ["FeePayment", C.FeePaymentSchema, F.FEE_PAYMENTS],
  ["FeeRefund", C.FeeRefundSchema, F.FEE_REFUNDS],
  ["LedgerAccount", C.LedgerAccountSchema, F.LEDGER_ACCOUNTS],
  ["JournalEntry", C.JournalEntrySchema, F.JOURNAL_ENTRIES],
  ["Budget", C.BudgetSchema, F.BUDGETS],
  ["GradingScheme", C.GradingSchemeSchema, F.GRADING_SCHEMES],
  ["Rubric", C.RubricSchema, F.RUBRICS],
  ["Assessment", C.AssessmentSchema, F.ASSESSMENTS],
  ["MarkEntry", C.MarkEntrySchema, F.MARK_ENTRIES],
  ["Exam", C.ExamSchema, F.EXAMS],
  ["ExamPaper", C.ExamPaperSchema, F.EXAM_PAPERS],
  ["SeatAssignment", C.SeatAssignmentSchema, F.SEAT_ASSIGNMENTS],
  ["HallTicket", C.HallTicketSchema, F.HALL_TICKETS],
  ["RevaluationRequest", C.RevaluationRequestSchema, F.REVALUATION_REQUESTS],
  ["ReportCard", C.ReportCardSchema, F.REPORT_CARDS],
  ["IssuedDocument", C.IssuedDocumentSchema, F.ISSUED_DOCUMENTS],
  ["IssuedDocumentRead", C.IssuedDocumentReadSchema, F.ISSUED_DOCUMENTS],
  ["MessageThread", C.MessageThreadSchema, F.MESSAGE_THREADS],
  ["ThreadMessage", C.ThreadMessageSchema, F.THREAD_MESSAGES],
  ["Notice", C.NoticeSchema, F.NOTICES],
  ["MeetingSlot", C.MeetingSlotSchema, F.MEETING_SLOTS],
  ["MeetingBooking", C.MeetingBookingSchema, F.MEETING_BOOKINGS],
  [
    "RoleHome",
    C.RoleHomeSchema,
    [
      {
        role: "family",
        personId: "per-1",
        learnerIds: ["lrn-1"],
        cards: [
          {
            kind: "fees",
            titleKey: "m28.card.fees",
            moduleId: "M18",
            count: 1,
            severity: null,
            href: "/fees",
          },
        ],
        generatedAt: "2026-11-26T08:00:00Z",
      },
    ],
  ],
  [
    "Kpi",
    C.KpiSchema,
    [
      {
        code: "collected",
        labelKey: "m28.kpi.collected",
        value: 1500,
        unit: "minor_units",
        currency: "INR",
        trend: null,
        asOf: "2026-11-26T08:00:00Z",
      },
    ],
  ],
  ["RolloverRun", C.RolloverRunSchema, F.ROLLOVER_RUNS],
  ["PromotionDecision", C.PromotionDecisionSchema, F.PROMOTION_DECISIONS],
];

/** Contracts with no backend response model of their own (`docs/CONTRACTS.md`: "frontend only"). */
export const FRONTEND_ONLY = ["TerminologyPack", "Page", "PageQuery"] as const;

type Json = Record<string, unknown>;

export type ParityContractEntry = readonly [string, z.ZodType, readonly unknown[]];

function mutations(row: Json): Json[] {
  const out: Json[] = [{ ...row, unexpectedField: 1 }];
  for (const [key, value] of Object.entries(row)) {
    const rest = Object.fromEntries(Object.entries(row).filter(([k]) => k !== key));
    out.push(rest, { ...row, [key]: null });
    if (typeof value === "string") out.push({ ...row, [key]: 12345 });
    else if (typeof value === "number") out.push({ ...row, [key]: "12345" });
    else if (typeof value === "boolean") out.push({ ...row, [key]: "yes" });
    else if (Array.isArray(value)) out.push({ ...row, [key]: "not-a-list" });
    else if (value !== null && typeof value === "object") out.push({ ...row, [key]: [] });
  }
  return out;
}

/**
 * Valid demo rows (up to 3) and generated invalid variants of the first, each with Zod's verdict: `valid`, and
 * `shapeValid` = no issue other than a cross-field rule (`custom`).
 */
export function buildParitySamples(contracts: readonly ParityContractEntry[]) {
  return contracts.map(([name, schema, rows]) => {
    const first = rows[0] as Json;
    const samples = [...rows.slice(0, 3), ...mutations(first)].map((sample) => {
      const result = schema.safeParse(sample);
      const shapeValid = result.success || result.error.issues.every((i) => i.code === "custom");
      return { sample, valid: result.success, shapeValid };
    });
    return { contract: name, samples };
  });
}

/** Written to `backend/tests/parity/samples.json` (NEX-059). */
export function paritySamples() {
  return buildParitySamples(CONTRACTS);
}

export function paritySamplesJson(): string {
  return `${JSON.stringify({ frontendOnly: FRONTEND_ONLY, contracts: paritySamples() }, null, 2)}\n`;
}
