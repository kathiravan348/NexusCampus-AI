import type {
  CatalogueCourse,
  ClassSession,
  LevelExam,
  MediaItem,
  PackPurchase,
  PracticeFeedback,
  SessionBooking,
  SessionPack,
} from "@nexus/contracts";
import { INSTITUTION, PERSON, TENANT } from "./ids";
import { FEE_INVOICE, LEARNER, PROGRAM } from "./ids-stage3";
import {
  BOOKING_CLIENT,
  CATALOGUE_COURSE as COURSE,
  CLASS_SESSION as SESSION,
  LEVEL_EXAM,
  PACK_PURCHASE as PURCHASE,
  PRACTICE_FEEDBACK as FEEDBACK,
  PRACTICE_MEDIA as MEDIA,
  SESSION_BOOKING as BOOKING,
  SESSION_PACK as PACK,
} from "./ids-stage4-more";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const tenantId = TENANT.harmony;
const institutionId = INSTITUTION.harmony;
const teacher = ROLE_PROFILES.find(
  (row) => row.tenantId === tenantId && row.personId === PERSON.hmPriya && row.kind === "staff",
);
if (!teacher) throw new Error("Missing Harmony session teacher");
const staffProfileId = teacher.id;
const courseId = COURSE.hmPiano;

const courseDefaults = {
  tenantId,
  institutionId,
  programId: PROGRAM.harmony,
  sessionMinutes: 45,
  ageMin: null,
  ageMax: null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};
export const CATALOGUE_COURSES: readonly CatalogueCourse[] = [
  {
    ...courseDefaults,
    id: courseId,
    code: "HM-PIANO",
    name: "Piano Studio",
    deliveryMode: "in_person",
    status: "active",
  },
  {
    ...courseDefaults,
    id: COURSE.hmDraft,
    code: "HM-RHYTHM",
    name: "Rhythm Workshop",
    deliveryMode: "hybrid",
    status: "draft",
  },
  {
    ...courseDefaults,
    id: COURSE.hmRetired,
    code: "HM-KEYS",
    name: "Keyboard Basics",
    deliveryMode: "online",
    status: "retired",
  },
];

const packDefaults = { tenantId, courseId, currency: "SGD", active: true };
export const SESSION_PACKS: readonly SessionPack[] = [
  {
    ...packDefaults,
    id: PACK.hmStudio,
    name: "Four studio sessions",
    sessions: 4,
    validityDays: 30,
    price: 10_000,
    trial: false,
  },
  {
    ...packDefaults,
    id: PACK.hmTrial,
    name: "Introductory trial session",
    sessions: 1,
    validityDays: 14,
    price: 0,
    trial: true,
  },
];

const purchaseDefaults = { tenantId, packId: PACK.hmStudio, sessionsTotal: 4 };
const [ethanInvoice, chloeInvoice, rachelInvoice] = FEE_INVOICE.hm;
export const PACK_PURCHASES: readonly PackPurchase[] = [
  {
    ...purchaseDefaults,
    id: PURCHASE.hmActive,
    learnerId: LEARNER.hmChloe,
    purchasedAt: "2026-11-18T15:00:00Z",
    expiresOn: "2026-12-18",
    sessionsUsed: 2,
    feeInvoiceId: chloeInvoice,
    status: "active",
  },
  {
    ...purchaseDefaults,
    id: PURCHASE.hmExhausted,
    packId: PACK.hmTrial,
    learnerId: LEARNER.hmMarcus,
    purchasedAt: "2026-11-20T02:00:00Z",
    expiresOn: "2026-12-04",
    sessionsTotal: 1,
    sessionsUsed: 1,
    feeInvoiceId: null,
    status: "exhausted",
  },
  {
    ...purchaseDefaults,
    id: PURCHASE.hmExpired,
    learnerId: LEARNER.hmRachel,
    purchasedAt: "2026-11-01T06:00:00Z",
    expiresOn: "2026-12-01",
    sessionsUsed: 0,
    feeInvoiceId: rachelInvoice,
    status: "expired",
  },
  {
    ...purchaseDefaults,
    id: PURCHASE.hmRefunded,
    learnerId: LEARNER.hmEthan,
    purchasedAt: "2026-09-12T11:00:00Z",
    expiresOn: "2026-10-12",
    sessionsUsed: 0,
    feeInvoiceId: ethanInvoice,
    status: "refunded",
  },
];

type SessionSpec = [string, ClassSession["kind"], string, ClassSession["status"], number];
const sessions: SessionSpec[] = [
  [SESSION.hmRegular, "regular", "2026-11-23", "done", 4],
  [SESSION.hmTrial, "trial", "2026-11-22", "done", 1],
  [SESSION.hmMakeUp, "make_up", "2026-11-27", "done", 1],
  [SESSION.hmScheduled, "regular", "2026-12-07", "scheduled", 4],
  [SESSION.hmCancelled, "regular", "2026-12-04", "cancelled", 4],
  [SESSION.hmReleased, "regular", "2026-12-02", "done", 4],
];
export const CLASS_SESSIONS: readonly ClassSession[] = sessions.map(
  ([id, kind, day, status, capacity]) => ({
    id,
    tenantId,
    courseId,
    staffProfileId,
    kind,
    startsAt: day + "T08:00:00Z",
    endsAt: day + "T08:45:00Z",
    roomId: null,
    liveSessionId: null,
    capacity,
    status,
  }),
);

type BookingSpec = [
  keyof typeof BOOKING,
  string,
  SessionBooking["status"],
  string,
  boolean,
  string?,
];
const bookings: BookingSpec[] = [
  ["hmBooked", SESSION.hmScheduled, "booked", "2026-11-27", false],
  ["hmAttended", SESSION.hmTrial, "attended", "2026-11-20", true],
  ["hmMissed", SESSION.hmRegular, "no_show", "2026-11-20", true],
  ["hmMakeUp", SESSION.hmMakeUp, "attended", "2026-11-24", false, BOOKING.hmMissed],
  ["hmLearnerCancelled", SESSION.hmReleased, "cancelled_by_learner", "2026-11-25", true],
  ["hmInstitutionCancelled", SESSION.hmCancelled, "cancelled_by_institution", "2026-11-25", false],
];
export const SESSION_BOOKINGS: readonly SessionBooking[] = bookings.map(
  ([key, sessionId, status, day, deductsSession, makeUpForBookingId = null]) => {
    const trial = sessionId === SESSION.hmTrial;
    return {
      id: BOOKING[key],
      tenantId,
      sessionId,
      learnerId: trial ? LEARNER.hmMarcus : LEARNER.hmChloe,
      purchaseId: trial ? PURCHASE.hmExhausted : PURCHASE.hmActive,
      status,
      deductsSession,
      makeUpForBookingId,
      clientId: BOOKING_CLIENT[key],
      deviceId: null,
      bookedAt: day + "T07:00:00Z",
    };
  },
);

type ExamSpec = [string, string, number, string, LevelExam["result"]];
const exams: ExamSpec[] = [
  [LEVEL_EXAM.hmPending, LEARNER.hmMarcus, 2, "2026-12-12", "pending"],
  [LEVEL_EXAM.hmPass, LEARNER.hmRachel, 1, "2026-08-28", "pass"],
  [LEVEL_EXAM.hmMerit, LEARNER.hmRachel, 2, "2026-11-05", "merit"],
  [LEVEL_EXAM.hmDistinction, LEARNER.hmMarcus, 1, "2026-10-10", "distinction"],
  [LEVEL_EXAM.hmFail, LEARNER.hmRachel, 2, "2026-10-10", "fail"],
];
export const LEVEL_EXAMS: readonly LevelExam[] = exams.map(
  ([id, learnerId, level, examDate, result]) => ({
    id,
    tenantId,
    courseId,
    learnerId,
    level,
    examDate,
    result,
    externalBoard: null,
    examinerStaffProfileId: result === "pending" ? null : staffProfileId,
    credentialId: null,
  }),
);

const mediaDefaults = {
  tenantId,
  institutionId,
  kind: "audio",
  contentType: "audio/mpeg",
  sizeBytes: 210_000,
  uploadedByProfileId: staffProfileId,
  visibility: "staff_only",
  consentState: "pending",
  caption: null,
  aiCaption: null,
  outcomeIds: [],
  aiSuggestedOutcomeIds: [],
  status: "active",
} satisfies Partial<MediaItem>;
export const HARMONY_PRACTICE_MEDIA: readonly MediaItem[] = [
  {
    ...mediaDefaults,
    id: MEDIA.hmDraft,
    fileName: "legato-practice.mp3",
    sha256: "a1".repeat(32),
    taggedLearnerIds: [LEARNER.hmRachel],
    capturedAt: "2026-11-12T08:00:00Z",
    createdAt: "2026-11-12T09:00:00Z",
  },
  {
    ...mediaDefaults,
    id: MEDIA.hmShared,
    fileName: "steady-tempo.mp3",
    sha256: "b2".repeat(32),
    taggedLearnerIds: [LEARNER.hmMarcus],
    capturedAt: "2026-11-22T08:50:00Z",
    createdAt: "2026-11-22T09:00:00Z",
  },
];

const feedbackDefaults = { tenantId, courseId, aiGenerated: true, tier: "multimodal" } as const;
export const PRACTICE_FEEDBACK: readonly PracticeFeedback[] = [
  {
    ...feedbackDefaults,
    id: FEEDBACK.hmDraft,
    learnerId: LEARNER.hmRachel,
    mediaItemId: MEDIA.hmDraft,
    feedback: "Connect the notes in the middle phrase and release at the phrase ending.",
    focusPoints: ["Legato phrasing"],
    status: "draft",
    sharedByStaffProfileId: null,
    sharedAt: null,
  },
  {
    ...feedbackDefaults,
    id: FEEDBACK.hmShared,
    learnerId: LEARNER.hmMarcus,
    mediaItemId: MEDIA.hmShared,
    feedback: "Keep the pulse steady through the rests before increasing the tempo.",
    focusPoints: ["Steady pulse through rests"],
    status: "shared",
    sharedByStaffProfileId: staffProfileId,
    sharedAt: "2026-11-24T08:00:00Z",
  },
];
