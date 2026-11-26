import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import { CapabilityTierSchema } from "./ai";
import {
  CurrencyCodeSchema,
  IdSchema,
  IsoDateSchema,
  MinorUnitsSchema,
  NameSchema,
  UtcDateTimeSchema,
} from "./common";

/**
 * M41 courses, sessions and packages (NEX-254, D87): rolling courses for skill and online institutes — packs bought
 * through M18, sessions (regular, trial, make-up), bookings, level exams and AI practice feedback a teacher shares.
 *
 * Server checks (not expressible per record): bookings stay within a session's capacity; a pack's sessions are used
 * before it expires; refunds go through M18; cancellation windows are tenant settings; practice feedback needs the
 * tenant AI switch and, for minors, a guardian's `ai_features` consent (A-3), and a teacher shares it (A-4).
 */

const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);

export const CatalogueCourseSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    code: AcademicCodeSchema,
    name: NameSchema,
    /** M15 program, when the course follows one. */
    programId: IdSchema.nullable(),
    deliveryMode: z.enum(["in_person", "online", "hybrid"]),
    sessionMinutes: z.int().min(15).max(480),
    ageMin: z.int().min(0).max(120).nullable(),
    ageMax: z.int().min(0).max(120).nullable(),
    status: z.enum(["draft", "active", "retired"]),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((course) => isNotBefore(course.updatedAt, course.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine(
    (course) => course.ageMin === null || course.ageMax === null || course.ageMin <= course.ageMax,
    {
      message: "ageMin is above ageMax",
      path: ["ageMax"],
    },
  );
export type CatalogueCourse = z.infer<typeof CatalogueCourseSchema>;

export const SessionPackSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    courseId: IdSchema,
    name: NameSchema,
    sessions: z.int().min(1).max(200),
    validityDays: z.int().min(1).max(730),
    price: MinorUnitsSchema.min(0),
    currency: CurrencyCodeSchema,
    trial: z.boolean(),
    active: z.boolean(),
  })
  .refine((pack) => !pack.trial || pack.sessions <= 2, {
    message: "a trial pack has at most 2 sessions",
    path: ["sessions"],
  });
export type SessionPack = z.infer<typeof SessionPackSchema>;

export const PackPurchaseStatusSchema = z.enum(["active", "exhausted", "expired", "refunded"]);
export type PackPurchaseStatus = z.infer<typeof PackPurchaseStatusSchema>;

export const PackPurchaseSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    packId: IdSchema,
    learnerId: IdSchema,
    purchasedAt: UtcDateTimeSchema,
    expiresOn: IsoDateSchema,
    sessionsTotal: z.int().min(1).max(200),
    sessionsUsed: z.int().min(0),
    /** M18 fee invoice; null for a free trial. */
    feeInvoiceId: IdSchema.nullable(),
    status: PackPurchaseStatusSchema,
  })
  .refine((purchase) => purchase.sessionsUsed <= purchase.sessionsTotal, {
    message: "sessionsUsed is more than sessionsTotal",
    path: ["sessionsUsed"],
  })
  .refine(
    (purchase) =>
      (purchase.status === "exhausted") === (purchase.sessionsUsed === purchase.sessionsTotal),
    { message: "a purchase is exhausted exactly when every session is used", path: ["status"] },
  )
  .refine((purchase) => purchase.expiresOn >= purchase.purchasedAt.slice(0, 10), {
    message: "expiresOn is before the purchase",
    path: ["expiresOn"],
  });
export type PackPurchase = z.infer<typeof PackPurchaseSchema>;

export const ClassSessionKindSchema = z.enum(["regular", "trial", "make_up"]);
export type ClassSessionKind = z.infer<typeof ClassSessionKindSchema>;

export const ClassSessionSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    courseId: IdSchema,
    staffProfileId: IdSchema,
    kind: ClassSessionKindSchema,
    startsAt: UtcDateTimeSchema,
    endsAt: UtcDateTimeSchema,
    roomId: IdSchema.nullable(),
    /** M36 live session for online delivery. */
    liveSessionId: IdSchema.nullable(),
    capacity: z.int().min(1).max(500),
    status: z.enum(["scheduled", "done", "cancelled"]),
  })
  .refine((session) => Date.parse(session.endsAt) > Date.parse(session.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type ClassSession = z.infer<typeof ClassSessionSchema>;

export const SessionBookingStatusSchema = z.enum([
  "booked",
  "attended",
  "no_show",
  "cancelled_by_learner",
  "cancelled_by_institution",
]);
export type SessionBookingStatus = z.infer<typeof SessionBookingStatusSchema>;

export const SessionBookingSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    sessionId: IdSchema,
    learnerId: IdSchema,
    purchaseId: IdSchema,
    status: SessionBookingStatusSchema,
    deductsSession: z.boolean(),
    /** The missed booking this make-up replaces. */
    makeUpForBookingId: IdSchema.nullable(),
    /** Offline outbox client id (L2). */
    clientId: z.uuid(),
    deviceId: IdSchema.nullable(),
    bookedAt: UtcDateTimeSchema,
  })
  .refine((booking) => booking.status !== "cancelled_by_institution" || !booking.deductsSession, {
    message: "a session cancelled by the institution is never deducted",
    path: ["deductsSession"],
  })
  .refine((booking) => booking.makeUpForBookingId === null || !booking.deductsSession, {
    message: "a make-up does not deduct a second session",
    path: ["deductsSession"],
  })
  .refine((booking) => booking.makeUpForBookingId !== booking.id, {
    message: "a booking cannot make up for itself",
    path: ["makeUpForBookingId"],
  });
export type SessionBooking = z.infer<typeof SessionBookingSchema>;

export const LevelExamResultSchema = z.enum(["pending", "pass", "merit", "distinction", "fail"]);
export type LevelExamResult = z.infer<typeof LevelExamResultSchema>;

export const LevelExamSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    courseId: IdSchema,
    learnerId: IdSchema,
    level: z.int().min(1).max(50),
    examDate: IsoDateSchema,
    externalBoard: z.string().trim().min(1).max(100).nullable(),
    examinerStaffProfileId: IdSchema.nullable(),
    result: LevelExamResultSchema,
    /** M45 credential, only for a passed exam. */
    credentialId: IdSchema.nullable(),
  })
  .refine(
    (exam) => exam.credentialId === null || ["pass", "merit", "distinction"].includes(exam.result),
    { message: "only a passed exam carries a credential", path: ["credentialId"] },
  );
export type LevelExam = z.infer<typeof LevelExamSchema>;

/** AI feedback on a practice recording; a teacher reviews and shares it. */
export const PracticeFeedbackSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    courseId: IdSchema,
    /** M91 recording. */
    mediaItemId: IdSchema,
    aiGenerated: z.literal(true),
    tier: CapabilityTierSchema,
    feedback: z.string().trim().min(1).max(3000),
    focusPoints: z.array(z.string().trim().min(1).max(200)).max(5),
    status: z.enum(["draft", "shared"]),
    sharedByStaffProfileId: IdSchema.nullable(),
    sharedAt: UtcDateTimeSchema.nullable(),
  })
  .refine(
    (item) =>
      (item.status === "shared") === (item.sharedByStaffProfileId !== null) &&
      (item.status === "shared") === (item.sharedAt !== null),
    {
      message: "a person and a time are recorded exactly when the feedback is shared",
      path: ["sharedByStaffProfileId"],
    },
  );
export type PracticeFeedback = z.infer<typeof PracticeFeedbackSchema>;
