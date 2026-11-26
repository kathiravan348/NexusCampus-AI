import { describe, expect, it } from "vitest";
import {
  CatalogueCourseSchema,
  ClassSessionSchema,
  LevelExamSchema,
  PackPurchaseSchema,
  PracticeFeedbackSchema,
  SessionBookingSchema,
  SessionPackSchema,
  type CatalogueCourse,
  type ClassSession,
  type LevelExamResult,
  type PackPurchase,
  type PracticeFeedback,
  type SessionBooking,
  type SessionBookingStatus,
  type SessionPack,
} from "./index";

const course: CatalogueCourse = {
  id: "course-piano-junior",
  tenantId: "tenant-music",
  institutionId: "institution-music",
  code: "PIANO-JR",
  name: "Junior piano",
  programId: null,
  deliveryMode: "in_person",
  sessionMinutes: 45,
  ageMin: 6,
  ageMax: 12,
  status: "active",
  createdAt: "2026-05-01T08:00:00Z",
  updatedAt: "2026-05-01T08:00:00Z",
};
const pack: SessionPack = {
  id: "pack-piano-10",
  tenantId: "tenant-music",
  courseId: course.id,
  name: "10 lessons",
  sessions: 10,
  validityDays: 120,
  price: 600000,
  currency: "INR",
  trial: false,
  active: true,
};
const purchase: PackPurchase = {
  id: "purchase-1",
  tenantId: "tenant-music",
  packId: pack.id,
  learnerId: "learner-isha",
  purchasedAt: "2026-06-01T08:00:00Z",
  expiresOn: "2026-09-29",
  sessionsTotal: 10,
  sessionsUsed: 3,
  feeInvoiceId: "fee-invoice-90",
  status: "active",
};
const session: ClassSession = {
  id: "session-1",
  tenantId: "tenant-music",
  courseId: course.id,
  staffProfileId: "staff-piano",
  kind: "regular",
  startsAt: "2026-06-05T11:00:00Z",
  endsAt: "2026-06-05T11:45:00Z",
  roomId: "room-studio-2",
  liveSessionId: null,
  capacity: 4,
  status: "scheduled",
};
const booking: SessionBooking = {
  id: "booking-1",
  tenantId: "tenant-music",
  sessionId: session.id,
  learnerId: "learner-isha",
  purchaseId: purchase.id,
  status: "booked",
  deductsSession: true,
  makeUpForBookingId: null,
  clientId: "8a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d",
  deviceId: null,
  bookedAt: "2026-06-02T08:00:00Z",
};
const feedback: PracticeFeedback = {
  id: "practice-feedback-1",
  tenantId: "tenant-music",
  learnerId: "learner-isha",
  courseId: course.id,
  mediaItemId: "media-scale-practice",
  aiGenerated: true,
  tier: "multimodal",
  feedback: "Even tempo in the right hand; the left hand rushes in bar 3.",
  focusPoints: ["Count bar 3 aloud"],
  status: "shared",
  sharedByStaffProfileId: "staff-piano",
  sharedAt: "2026-06-06T09:00:00Z",
};

describe("courses, packs and purchases", () => {
  it("accepts a course with age limits, a 10-lesson and a trial pack and each purchase status", () => {
    expect(CatalogueCourseSchema.safeParse(course).success).toBe(true);
    expect(SessionPackSchema.safeParse(pack).success).toBe(true);
    expect(
      SessionPackSchema.safeParse({ ...pack, id: "pack-trial", sessions: 1, price: 0, trial: true })
        .success,
    ).toBe(true);
    expect(PackPurchaseSchema.safeParse(purchase).success).toBe(true);
    expect(
      PackPurchaseSchema.safeParse({ ...purchase, sessionsUsed: 10, status: "exhausted" }).success,
    ).toBe(true);
    expect(PackPurchaseSchema.safeParse({ ...purchase, status: "expired" }).success).toBe(true);
    expect(
      PackPurchaseSchema.safeParse({ ...purchase, status: "refunded", feeInvoiceId: null }).success,
    ).toBe(true);
  });

  it("rejects bad ages, trials and usage", () => {
    expect(CatalogueCourseSchema.safeParse({ ...course, ageMin: 13 }).success).toBe(false);
    expect(SessionPackSchema.safeParse({ ...pack, trial: true, sessions: 3 }).success).toBe(false);
    expect(PackPurchaseSchema.safeParse({ ...purchase, sessionsUsed: 11 }).success).toBe(false);
    expect(PackPurchaseSchema.safeParse({ ...purchase, status: "exhausted" }).success).toBe(false);
    expect(PackPurchaseSchema.safeParse({ ...purchase, sessionsUsed: 10 }).success).toBe(false);
    expect(PackPurchaseSchema.safeParse({ ...purchase, expiresOn: "2026-05-31" }).success).toBe(
      false,
    );
  });
});

describe("sessions and bookings", () => {
  it("accepts each session kind and each booking status, including a make-up", () => {
    for (const kind of ["regular", "trial", "make_up"] as const) {
      expect(ClassSessionSchema.safeParse({ ...session, kind }).success).toBe(true);
    }
    const statuses: SessionBookingStatus[] = [
      "booked",
      "attended",
      "no_show",
      "cancelled_by_learner",
    ];
    for (const status of statuses) {
      expect(SessionBookingSchema.safeParse({ ...booking, status }).success).toBe(true);
    }
    const byInstitution = { ...booking, status: "cancelled_by_institution", deductsSession: false };
    expect(SessionBookingSchema.safeParse(byInstitution).success).toBe(true);
    const makeUp = {
      ...booking,
      id: "booking-2",
      deductsSession: false,
      makeUpForBookingId: booking.id,
    };
    expect(SessionBookingSchema.safeParse(makeUp).success).toBe(true);
  });

  it("rejects bad sessions and unfair deductions", () => {
    expect(ClassSessionSchema.safeParse({ ...session, endsAt: session.startsAt }).success).toBe(
      false,
    );
    expect(
      SessionBookingSchema.safeParse({ ...booking, status: "cancelled_by_institution" }).success,
    ).toBe(false);
    expect(
      SessionBookingSchema.safeParse({ ...booking, makeUpForBookingId: "booking-0" }).success,
    ).toBe(false);
    const self = { ...booking, deductsSession: false, makeUpForBookingId: booking.id };
    expect(SessionBookingSchema.safeParse(self).success).toBe(false);
  });
});

describe("level exams and practice feedback", () => {
  it("accepts each exam result and a draft and a shared feedback", () => {
    const exam = {
      id: "exam-1",
      tenantId: "tenant-music",
      courseId: course.id,
      learnerId: "learner-isha",
      level: 2,
      examDate: "2026-11-20",
      externalBoard: "Trinity",
      examinerStaffProfileId: null,
      result: "merit",
      credentialId: "credential-grade-2",
    };
    expect(LevelExamSchema.safeParse(exam).success).toBe(true);
    const results: LevelExamResult[] = ["pending", "pass", "distinction", "fail"];
    for (const result of results) {
      expect(LevelExamSchema.safeParse({ ...exam, result, credentialId: null }).success).toBe(true);
    }
    expect(LevelExamSchema.safeParse({ ...exam, result: "fail" }).success).toBe(false);
    expect(PracticeFeedbackSchema.safeParse(feedback).success).toBe(true);
    const draft = { ...feedback, status: "draft", sharedByStaffProfileId: null, sharedAt: null };
    expect(PracticeFeedbackSchema.safeParse(draft).success).toBe(true);
  });

  it("rejects shared feedback without a person and unlabelled feedback", () => {
    expect(
      PracticeFeedbackSchema.safeParse({ ...feedback, sharedByStaffProfileId: null }).success,
    ).toBe(false);
    expect(PracticeFeedbackSchema.safeParse({ ...feedback, aiGenerated: false }).success).toBe(
      false,
    );
    const six = Array.from({ length: 6 }, (_, index) => `Point ${index}`);
    expect(PracticeFeedbackSchema.safeParse({ ...feedback, focusPoints: six }).success).toBe(false);
  });
});
