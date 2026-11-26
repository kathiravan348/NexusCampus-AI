import { z } from "zod";
import { AssistSourceSchema, CapabilityTierSchema } from "./ai";
import { IdSchema, IsoDateSchema, LocaleSchema, UtcDateTimeSchema } from "./common";

/**
 * M37 early years (NEX-216, D87): the day captured offline (L2) on a carer's phone — diary, observations tagged to
 * milestones, drop-off and pick-up checks, ratios — and an AI day summary a person sends to the family.
 *
 * Server checks (not expressible per record): a pick-up by a guardian whose M14 right is `not_allowed` or
 * `court_restricted`, or by anyone not on the learner's authorised list, is refused and alerts the manager; an
 * observation of several children is shared with each family without the other children's names; photos follow M91
 * media consent; AI milestone tagging and day summaries need the tenant AI switch, a guardian's `ai_features` consent
 * and never read health (M61) data; medication is recorded in M61, never in the diary.
 */

const isUnique = (values: readonly unknown[]) => new Set(values).size === values.length;
const uniqueIds = (max: number) =>
  z.array(IdSchema).max(max).refine(isUnique, { message: "ids must be unique" });
const isAfter = (later: string, earlier: string) => Date.parse(later) > Date.parse(earlier);

/** Captured offline through the outbox (L2). */
const offlineFields = {
  clientId: z.uuid(),
  deviceId: IdSchema.nullable(),
  recordedByStaffProfileId: IdSchema,
};

export const DiaryEntryKindSchema = z.enum([
  "meal",
  "drink",
  "nap",
  "nappy",
  "toilet",
  "activity",
  "note",
]);
export type DiaryEntryKind = z.infer<typeof DiaryEntryKindSchema>;

export const DiaryAmountSchema = z.enum(["none", "some", "most", "all"]);
export type DiaryAmount = z.infer<typeof DiaryAmountSchema>;

export const NappyStateSchema = z.enum(["wet", "dirty", "dry"]);
export type NappyState = z.infer<typeof NappyStateSchema>;

export const DiaryEntrySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    date: IsoDateSchema,
    kind: DiaryEntryKindSchema,
    occurredAt: UtcDateTimeSchema,
    /** Set exactly for meals and drinks. */
    amount: DiaryAmountSchema.nullable(),
    /** Set exactly for naps. */
    napEndedAt: UtcDateTimeSchema.nullable(),
    /** Set exactly for nappy changes. */
    nappyState: NappyStateSchema.nullable(),
    /** Personal data (V-7). */
    note: z.string().trim().max(500).nullable(),
    sharedWithFamily: z.boolean(),
    ...offlineFields,
    createdAt: UtcDateTimeSchema,
  })
  .refine(
    (entry) => (entry.kind === "meal" || entry.kind === "drink") === (entry.amount !== null),
    {
      message: "amount is set exactly for meals and drinks",
      path: ["amount"],
    },
  )
  .refine((entry) => (entry.kind === "nap") === (entry.napEndedAt !== null), {
    message: "napEndedAt is set exactly for naps",
    path: ["napEndedAt"],
  })
  .refine((entry) => entry.napEndedAt === null || isAfter(entry.napEndedAt, entry.occurredAt), {
    message: "a nap ends after it starts",
    path: ["napEndedAt"],
  })
  .refine((entry) => (entry.kind === "nappy") === (entry.nappyState !== null), {
    message: "nappyState is set exactly for nappy changes",
    path: ["nappyState"],
  });
export type DiaryEntry = z.infer<typeof DiaryEntrySchema>;

export const ObservationSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerIds: uniqueIds(10).min(1),
    observedAt: UtcDateTimeSchema,
    /** Personal data (V-7). */
    text: z.string().trim().min(1).max(4000),
    /** Milestones a person accepted. */
    milestoneOutcomeIds: uniqueIds(10),
    /** AI tagging suggestions only; never progress by themselves (A-4). */
    aiSuggestedOutcomeIds: uniqueIds(10),
    /** M91 media items. */
    mediaItemIds: uniqueIds(10),
    sharedWithFamily: z.boolean(),
    ...offlineFields,
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((observation) => Date.parse(observation.updatedAt) >= Date.parse(observation.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type Observation = z.infer<typeof ObservationSchema>;

export const MilestoneStatusSchema = z.enum(["not_yet", "emerging", "achieved"]);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

export const MilestoneProgressSchema = z
  .strictObject({
    tenantId: IdSchema,
    learnerId: IdSchema,
    outcomeId: IdSchema,
    status: MilestoneStatusSchema,
    achievedOn: IsoDateSchema.nullable(),
    evidenceObservationIds: uniqueIds(20),
    assessedByStaffProfileId: IdSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((progress) => (progress.status === "achieved") === (progress.achievedOn !== null), {
    message: "achievedOn is set exactly when the milestone is achieved",
    path: ["achievedOn"],
  });
export type MilestoneProgress = z.infer<typeof MilestoneProgressSchema>;

export const CollectorKindSchema = z.enum(["guardian", "authorised_person", "staff", "transport"]);
export type CollectorKind = z.infer<typeof CollectorKindSchema>;

/** How staff confirmed the collector — always a person, never face recognition. */
export const PickupVerificationSchema = z.enum(["photo_id", "password", "known_to_staff", "pin"]);
export type PickupVerification = z.infer<typeof PickupVerificationSchema>;

export const PickupCheckSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    date: IsoDateSchema,
    kind: z.enum(["drop_off", "pick_up"]),
    at: UtcDateTimeSchema,
    collectorKind: CollectorKindSchema,
    /** Guardian or `AuthorisedPickup` id; set exactly for those two collector kinds. */
    collectorRefId: IdSchema.nullable(),
    verification: PickupVerificationSchema,
    outcome: z.enum(["released", "refused"]),
    refusedReason: z.string().trim().min(1).max(300).nullable(),
    ...offlineFields,
  })
  .refine(
    (check) =>
      (check.collectorKind === "guardian" || check.collectorKind === "authorised_person") ===
      (check.collectorRefId !== null),
    {
      message: "collectorRefId is set exactly for guardians and authorised people",
      path: ["collectorRefId"],
    },
  )
  .refine((check) => (check.outcome === "refused") === (check.refusedReason !== null), {
    message: "refusedReason is set exactly when the child is not released",
    path: ["refusedReason"],
  });
export type PickupCheck = z.infer<typeof PickupCheckSchema>;

export const RatioSnapshotSchema = z
  .strictObject({
    tenantId: IdSchema,
    classGroupId: IdSchema,
    at: UtcDateTimeSchema,
    childrenPresent: z.int().min(0),
    staffPresent: z.int().min(0),
    /** From the region compliance pack. */
    maxChildrenPerStaff: z.int().min(1).max(30),
    withinRatio: z.boolean(),
  })
  .refine(
    (ratio) =>
      ratio.withinRatio === ratio.childrenPresent <= ratio.staffPresent * ratio.maxChildrenPerStaff,
    { message: "withinRatio does not match the counts", path: ["withinRatio"] },
  );
export type RatioSnapshot = z.infer<typeof RatioSnapshotSchema>;

/** An AI summary of a child's day; a person reviews and sends it to the family. */
export const DaySummarySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    learnerId: IdSchema,
    date: IsoDateSchema,
    aiGenerated: z.literal(true),
    tier: CapabilityTierSchema,
    locale: LocaleSchema,
    text: z.string().trim().min(1).max(3000),
    sources: z.array(AssistSourceSchema).min(1).max(20),
    status: z.enum(["draft", "sent"]),
    sentByStaffProfileId: IdSchema.nullable(),
    sentAt: UtcDateTimeSchema.nullable(),
  })
  .refine(
    (summary) =>
      (summary.status === "sent") === (summary.sentByStaffProfileId !== null) &&
      (summary.status === "sent") === (summary.sentAt !== null),
    {
      message: "a person and a time are recorded exactly when the summary is sent",
      path: ["sentByStaffProfileId"],
    },
  );
export type DaySummary = z.infer<typeof DaySummarySchema>;
