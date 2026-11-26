import { describe, expect, it } from "vitest";
import {
  DaySummarySchema,
  DiaryEntrySchema,
  MilestoneProgressSchema,
  ObservationSchema,
  PickupCheckSchema,
  RatioSnapshotSchema,
  type DaySummary,
  type DiaryEntry,
  type DiaryEntryKind,
  type MilestoneProgress,
  type Observation,
  type PickupCheck,
} from "./index";

const offline = {
  clientId: "3f2c1b0a-9d8e-4f7a-b6c5-d4e3f2a1b0c9",
  deviceId: "device-room-sunflower",
  recordedByStaffProfileId: "staff-carer-anu",
};
const meal: DiaryEntry = {
  ...offline,
  id: "diary-1",
  tenantId: "tenant-playschool",
  learnerId: "learner-kavin",
  date: "2026-07-06",
  kind: "meal",
  occurredAt: "2026-07-06T06:30:00Z",
  amount: "most",
  napEndedAt: null,
  nappyState: null,
  note: "Asked for more dal.",
  sharedWithFamily: true,
  createdAt: "2026-07-06T06:31:00Z",
};
const observation: Observation = {
  ...offline,
  id: "observation-1",
  tenantId: "tenant-playschool",
  learnerIds: ["learner-kavin", "learner-meena"],
  observedAt: "2026-07-06T05:00:00Z",
  text: "Built a tower of six blocks together and counted aloud.",
  milestoneOutcomeIds: ["milestone-counting-5"],
  aiSuggestedOutcomeIds: ["milestone-cooperative-play"],
  mediaItemIds: ["media-tower"],
  sharedWithFamily: true,
  createdAt: "2026-07-06T05:02:00Z",
  updatedAt: "2026-07-06T05:10:00Z",
};
const progress: MilestoneProgress = {
  tenantId: "tenant-playschool",
  learnerId: "learner-kavin",
  outcomeId: "milestone-counting-5",
  status: "achieved",
  achievedOn: "2026-07-06",
  evidenceObservationIds: [observation.id],
  assessedByStaffProfileId: "staff-carer-anu",
  updatedAt: "2026-07-06T08:00:00Z",
};
const pickup: PickupCheck = {
  ...offline,
  id: "pickup-1",
  tenantId: "tenant-playschool",
  learnerId: "learner-kavin",
  date: "2026-07-06",
  kind: "pick_up",
  at: "2026-07-06T09:30:00Z",
  collectorKind: "authorised_person",
  collectorRefId: "authorised-pickup-grandma",
  verification: "photo_id",
  outcome: "released",
  refusedReason: null,
};
const summary: DaySummary = {
  id: "day-summary-1",
  tenantId: "tenant-playschool",
  learnerId: "learner-kavin",
  date: "2026-07-06",
  aiGenerated: true,
  tier: "fast",
  locale: "ta-IN",
  text: "Kavin ate most of his lunch, napped for an hour and counted to six with a friend.",
  sources: [{ moduleId: "M37", recordType: "diaryEntry", recordId: meal.id, label: "Lunch" }],
  status: "sent",
  sentByStaffProfileId: "staff-carer-anu",
  sentAt: "2026-07-06T10:00:00Z",
};

describe("diary entries", () => {
  it("accepts one entry of each kind", () => {
    const plain = { amount: null, napEndedAt: null, nappyState: null };
    const byKind: Record<DiaryEntryKind, DiaryEntry> = {
      meal,
      drink: { ...meal, kind: "drink", amount: "all" },
      nap: { ...meal, ...plain, kind: "nap", napEndedAt: "2026-07-06T07:45:00Z" },
      nappy: { ...meal, ...plain, kind: "nappy", nappyState: "wet" },
      toilet: { ...meal, ...plain, kind: "toilet" },
      activity: { ...meal, ...plain, kind: "activity", note: "Sand play." },
      note: { ...meal, ...plain, kind: "note", sharedWithFamily: false },
    };
    for (const entry of Object.values(byKind)) {
      expect(DiaryEntrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it("rejects payloads that do not fit the kind", () => {
    const nap = { ...meal, kind: "nap", amount: null, napEndedAt: "2026-07-06T07:45:00Z" };
    expect(DiaryEntrySchema.safeParse({ ...nap, amount: "some" }).success).toBe(false);
    expect(DiaryEntrySchema.safeParse({ ...nap, napEndedAt: null }).success).toBe(false);
    expect(DiaryEntrySchema.safeParse({ ...nap, napEndedAt: nap.occurredAt }).success).toBe(false);
    expect(DiaryEntrySchema.safeParse({ ...meal, amount: null }).success).toBe(false);
    expect(DiaryEntrySchema.safeParse({ ...meal, kind: "medication" }).success).toBe(false);
    expect(DiaryEntrySchema.safeParse({ ...meal, nappyState: "dry" }).success).toBe(false);
    expect(DiaryEntrySchema.safeParse({ ...meal, clientId: "client-1" }).success).toBe(false);
  });
});

describe("observations and milestones", () => {
  it("accepts a group observation with AI suggestions and each milestone status", () => {
    expect(ObservationSchema.safeParse(observation).success).toBe(true);
    expect(MilestoneProgressSchema.safeParse(progress).success).toBe(true);
    for (const status of ["not_yet", "emerging"] as const) {
      expect(
        MilestoneProgressSchema.safeParse({ ...progress, status, achievedOn: null }).success,
      ).toBe(true);
    }
  });

  it("rejects 11 learners, no learners and achieved without date", () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `learner-${index}`);
    expect(ObservationSchema.safeParse({ ...observation, learnerIds: eleven }).success).toBe(false);
    expect(ObservationSchema.safeParse({ ...observation, learnerIds: [] }).success).toBe(false);
    expect(MilestoneProgressSchema.safeParse({ ...progress, achievedOn: null }).success).toBe(
      false,
    );
    expect(MilestoneProgressSchema.safeParse({ ...progress, status: "emerging" }).success).toBe(
      false,
    );
  });
});

describe("pickup checks and ratios", () => {
  it("accepts a released and a refused pick-up and a staff drop-off", () => {
    expect(PickupCheckSchema.safeParse(pickup).success).toBe(true);
    const refused = {
      ...pickup,
      collectorKind: "guardian",
      collectorRefId: "guardian-father",
      verification: "known_to_staff",
      outcome: "refused",
      refusedReason: "Court order restricts pick-up.",
    };
    expect(PickupCheckSchema.safeParse(refused).success).toBe(true);
    const dropOff = {
      ...pickup,
      kind: "drop_off",
      collectorKind: "staff",
      collectorRefId: null,
      verification: "pin",
    };
    expect(PickupCheckSchema.safeParse(dropOff).success).toBe(true);
  });

  it("rejects missing references and reasons", () => {
    expect(PickupCheckSchema.safeParse({ ...pickup, collectorRefId: null }).success).toBe(false);
    expect(PickupCheckSchema.safeParse({ ...pickup, collectorKind: "transport" }).success).toBe(
      false,
    );
    expect(PickupCheckSchema.safeParse({ ...pickup, outcome: "refused" }).success).toBe(false);
    expect(PickupCheckSchema.safeParse({ ...pickup, refusedReason: "x" }).success).toBe(false);
    expect(
      PickupCheckSchema.safeParse({ ...pickup, verification: "face_recognition" }).success,
    ).toBe(false);
  });

  it("checks ratios", () => {
    const ratio = {
      tenantId: "tenant-playschool",
      classGroupId: "class-sunflower",
      at: "2026-07-06T05:00:00Z",
      childrenPresent: 12,
      staffPresent: 2,
      maxChildrenPerStaff: 8,
      withinRatio: true,
    };
    expect(RatioSnapshotSchema.safeParse(ratio).success).toBe(true);
    expect(
      RatioSnapshotSchema.safeParse({ ...ratio, childrenPresent: 17, withinRatio: false }).success,
    ).toBe(true);
    expect(RatioSnapshotSchema.safeParse({ ...ratio, childrenPresent: 17 }).success).toBe(false);
    expect(RatioSnapshotSchema.safeParse({ ...ratio, maxChildrenPerStaff: 0 }).success).toBe(false);
  });
});

describe("day summaries", () => {
  it("accepts a draft and a sent summary", () => {
    expect(DaySummarySchema.safeParse(summary).success).toBe(true);
    const draft = { ...summary, status: "draft", sentByStaffProfileId: null, sentAt: null };
    expect(DaySummarySchema.safeParse(draft).success).toBe(true);
  });

  it("rejects summaries without sources, without a person or not labelled", () => {
    expect(DaySummarySchema.safeParse({ ...summary, sources: [] }).success).toBe(false);
    expect(DaySummarySchema.safeParse({ ...summary, sentByStaffProfileId: null }).success).toBe(
      false,
    );
    expect(DaySummarySchema.safeParse({ ...summary, status: "draft" }).success).toBe(false);
    expect(DaySummarySchema.safeParse({ ...summary, aiGenerated: false }).success).toBe(false);
  });
});
