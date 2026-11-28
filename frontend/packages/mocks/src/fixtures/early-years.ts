import type {
  DaySummary,
  DiaryEntry,
  MilestoneProgress,
  Observation,
  PickupCheck,
  RatioSnapshot,
} from "@nexus/contracts";
import { PERSON, TENANT } from "./ids";
import { AUTHORISED_PICKUP, CLASS_GROUP, LEARNER } from "./ids-stage3";
import {
  CARE_CLIENT_ID,
  DAY_SUMMARY,
  DIARY_ENTRY,
  OBSERVATION,
  PICKUP_CHECK,
} from "./ids-stage4-care";
import { OUTCOME } from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const tenantId = TENANT.littleSteps;
const staff = ROLE_PROFILES.find(
  (p) => p.tenantId === tenantId && p.personId === PERSON.lsArjun && p.kind === "staff",
);
if (!staff) throw new Error("Missing Little Steps care staff profile");

const date = "2026-09-14";
const at = (time: string) => date + "T" + time + ":00Z";
const capture = { tenantId, deviceId: null, recordedByStaffProfileId: staff.id };

function diary(
  kind: DiaryEntry["kind"],
  learnerId: string,
  time: string,
  details: Partial<Pick<DiaryEntry, "amount" | "napEndedAt" | "nappyState" | "note">> = {},
): DiaryEntry {
  return {
    id: DIARY_ENTRY[kind],
    clientId: CARE_CLIENT_ID[kind],
    ...capture,
    learnerId,
    date,
    kind,
    occurredAt: at(time),
    amount: null,
    napEndedAt: null,
    nappyState: null,
    note: null,
    sharedWithFamily: true,
    createdAt: CREATED_AT,
    ...details,
  };
}

export const DIARY_ENTRIES: readonly DiaryEntry[] = [
  diary("meal", LEARNER.lsKavya, "04:30", { amount: "most" }),
  diary("drink", LEARNER.lsIshaan, "05:00", { amount: "all" }),
  diary("nap", LEARNER.lsKavya, "07:00", { napEndedAt: at("07:45") }),
  diary("nappy", LEARNER.lsIshaan, "05:15", { nappyState: "wet" }),
  diary("toilet", LEARNER.lsKavya, "06:00"),
  diary("activity", LEARNER.lsIshaan, "08:20", { note: "Took turns stacking blocks." }),
  diary("note", LEARNER.lsKavya, "08:45", { note: "Chose a picture book." }),
];

export const OBSERVATIONS: readonly Observation[] = [
  {
    id: OBSERVATION.turnTaking,
    clientId: CARE_CLIENT_ID.turnTaking,
    ...capture,
    learnerIds: [LEARNER.lsKavya, LEARNER.lsIshaan],
    observedAt: at("08:20"),
    text: "Took turns choosing blocks and building a tower together.",
    milestoneOutcomeIds: [OUTCOME.lsSocial1],
    aiSuggestedOutcomeIds: [],
    mediaItemIds: [],
    sharedWithFamily: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  },
];

const milestone = {
  tenantId,
  learnerId: LEARNER.lsIshaan,
  assessedByStaffProfileId: staff.id,
  updatedAt: UPDATED_AT,
  achievedOn: null,
  evidenceObservationIds: [],
};

export const MILESTONE_PROGRESS: readonly MilestoneProgress[] = [
  { ...milestone, outcomeId: OUTCOME.lsLang1, status: "not_yet" },
  { ...milestone, outcomeId: OUTCOME.lsMotor1, status: "emerging" },
  {
    ...milestone,
    outcomeId: OUTCOME.lsSocial1,
    status: "achieved",
    achievedOn: date,
    evidenceObservationIds: [OBSERVATION.turnTaking],
  },
];

function pickup(
  key: keyof typeof PICKUP_CHECK,
  details: Pick<
    PickupCheck,
    "kind" | "collectorKind" | "collectorRefId" | "verification" | "learnerId"
  >,
  time: string,
  refusedReason: string | null = null,
): PickupCheck {
  return {
    id: PICKUP_CHECK[key],
    clientId: CARE_CLIENT_ID[key],
    ...capture,
    date,
    at: at(time),
    ...details,
    outcome: refusedReason === null ? "released" : "refused",
    refusedReason,
  };
}

export const PICKUP_CHECKS: readonly PickupCheck[] = [
  pickup(
    "guardian",
    {
      kind: "drop_off",
      learnerId: LEARNER.lsKavya,
      collectorKind: "guardian",
      collectorRefId: PERSON.lsArjun,
      verification: "known_to_staff",
    },
    "03:30",
  ),
  pickup(
    "staff",
    {
      kind: "drop_off",
      learnerId: LEARNER.lsRohan,
      collectorKind: "staff",
      collectorRefId: null,
      verification: "pin",
    },
    "03:40",
  ),
  pickup(
    "transport",
    {
      learnerId: LEARNER.lsIshaan,
      kind: "drop_off",
      collectorKind: "transport",
      collectorRefId: null,
      verification: "password",
    },
    "03:45",
  ),
  pickup(
    "refused",
    {
      kind: "pick_up",
      learnerId: LEARNER.lsKavya,
      collectorKind: "guardian",
      collectorRefId: PERSON.lsSunita,
      verification: "photo_id",
    },
    "09:10",
    "The collector has no collection authorisation for this learner.",
  ),
  pickup(
    "authorisedPerson",
    {
      kind: "pick_up",
      learnerId: LEARNER.lsKavya,
      collectorKind: "authorised_person",
      collectorRefId: AUTHORISED_PICKUP.littleSteps,
      verification: "password",
    },
    "09:20",
  ),
];

export const RATIO_SNAPSHOTS: readonly RatioSnapshot[] = [
  {
    tenantId,
    classGroupId: CLASS_GROUP.lsSeedlings,
    at: at("04:00"),
    childrenPresent: 2,
    staffPresent: 1,
    maxChildrenPerStaff: 6,
    withinRatio: true,
  },
  {
    tenantId,
    classGroupId: CLASS_GROUP.lsSeedlings,
    at: at("04:10"),
    childrenPresent: 2,
    staffPresent: 0,
    maxChildrenPerStaff: 6,
    withinRatio: false,
  },
];

// Saved summaries exercise the draft and sent states without invoking the AI gateway.
export const DAY_SUMMARIES: readonly DaySummary[] = [
  {
    id: DAY_SUMMARY.draft,
    tenantId,
    learnerId: LEARNER.lsIshaan,
    date,
    aiGenerated: true,
    tier: "fast",
    locale: "en-IN",
    text: "Took turns stacking blocks during play.",
    sources: [
      {
        moduleId: "M37",
        recordType: "diaryEntry",
        recordId: DIARY_ENTRY.activity,
        label: "Block play",
      },
    ],
    status: "draft",
    sentByStaffProfileId: null,
    sentAt: null,
  },
  {
    id: DAY_SUMMARY.sent,
    tenantId,
    learnerId: LEARNER.lsKavya,
    date,
    aiGenerated: true,
    tier: "fast",
    locale: "en-IN",
    text: "Rested during nap time and chose a picture book later in the day.",
    sources: [
      { moduleId: "M37", recordType: "diaryEntry", recordId: DIARY_ENTRY.nap, label: "Rest time" },
      {
        moduleId: "M37",
        recordType: "diaryEntry",
        recordId: DIARY_ENTRY.note,
        label: "Book choice",
      },
    ],
    status: "sent",
    sentByStaffProfileId: staff.id,
    sentAt: at("09:25"),
  },
];
