import type {
  Accommodation,
  GoalProgress,
  SupportGoal,
  SupportPlan,
  SupportSession,
} from "@nexus/contracts";
import { PERSON, TENANT } from "./ids";
import { LEARNER } from "./ids-stage3";
import {
  ACCOMMODATION,
  GOAL_PROGRESS as GOAL_PROGRESS_ID,
  SUPPORT_GOAL,
  SUPPORT_PLAN,
  SUPPORT_SESSION,
} from "./ids-stage4-care";
import { OUTCOME } from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const rv = TENANT.riverside;
const nb = TENANT.northbridge;
const timestamps = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

function staffId(tenantId: string, personId: string): string {
  const profile = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === personId && p.kind === "staff",
  );
  if (!profile) throw new Error("Missing inclusion staff profile");
  return profile.id;
}

const readingLead = staffId(rv, PERSON.rvAmira);
const riversideLead = staffId(rv, PERSON.rvHelen);
const northbridgeLead = staffId(nb, PERSON.nbElena);

export const SUPPORT_PLANS: readonly SupportPlan[] = [
  {
    id: SUPPORT_PLAN.rvReading,
    tenantId: rv,
    learnerId: LEARNER.rvMia,
    kind: "iep",
    status: "active",
    startOn: "2026-09-03",
    reviewOn: "2026-10-15",
    endOn: null,
    coordinatorStaffProfileId: readingLead,
    teamStaffProfileIds: [readingLead, riversideLead],
    guardian: "agreed",
    guardianRespondedOn: "2026-09-02",
    strengths: "Explains ideas clearly in conversation.",
    needsSummary: "Benefits from reading support.",
    ...timestamps,
  },
  {
    id: SUPPORT_PLAN.rvReview,
    tenantId: rv,
    learnerId: LEARNER.rvElla,
    kind: "ilp",
    status: "under_review",
    startOn: "2026-09-02",
    reviewOn: "2026-09-14",
    endOn: null,
    coordinatorStaffProfileId: riversideLead,
    teamStaffProfileIds: [riversideLead],
    guardian: "agreed",
    guardianRespondedOn: "2026-09-01",
    strengths: "Uses diagrams to explain reasoning.",
    needsSummary: "Benefits from worked examples.",
    ...timestamps,
  },
  {
    id: SUPPORT_PLAN.nbAccess,
    tenantId: nb,
    learnerId: LEARNER.nbJordan,
    kind: "accommodation_plan",
    status: "draft",
    startOn: "2026-09-21",
    reviewOn: "2026-10-19",
    endOn: null,
    coordinatorStaffProfileId: northbridgeLead,
    teamStaffProfileIds: [northbridgeLead],
    guardian: "invited",
    guardianRespondedOn: null,
    strengths: "Organises examples into clear steps.",
    needsSummary: "Benefits from written project instructions.",
    ...timestamps,
  },
  {
    id: SUPPORT_PLAN.nbClosed,
    tenantId: nb,
    learnerId: LEARNER.nbSofia,
    kind: "other",
    status: "closed",
    startOn: "2026-08-25",
    reviewOn: "2026-09-14",
    endOn: "2026-09-14",
    coordinatorStaffProfileId: northbridgeLead,
    teamStaffProfileIds: [northbridgeLead],
    guardian: "not_applicable",
    guardianRespondedOn: null,
    strengths: "Identifies patterns in examples.",
    needsSummary: "Benefits from a planning checklist.",
    ...timestamps,
  },
];

export const SUPPORT_GOALS: readonly SupportGoal[] = [
  {
    id: SUPPORT_GOAL.draft,
    tenantId: nb,
    planId: SUPPORT_PLAN.nbAccess,
    area: "independence",
    statement: "Use the project checklist to plan a programming task.",
    measure: "Records the first two steps on three tasks.",
    targetDate: "2026-10-16",
    outcomeIds: [OUTCOME.nbCo1],
    source: "manual",
    aiDraftStatement: null,
    status: "draft",
    approvedByStaffProfileId: null,
    approvedAt: null,
  },
  {
    id: SUPPORT_GOAL.active,
    tenantId: rv,
    planId: SUPPORT_PLAN.rvReading,
    area: "literacy",
    statement: "Identify the main idea in three short passages using a prompt card.",
    measure: "Identifies the main idea in three out of four passages.",
    targetDate: "2026-10-12",
    outcomeIds: [OUTCOME.rvEngRead],
    source: "ai_draft",
    aiDraftStatement: "Identify the main ideas in four passages with no prompts.",
    status: "active",
    approvedByStaffProfileId: readingLead,
    approvedAt: "2026-09-03T09:00:00Z",
  },
  {
    id: SUPPORT_GOAL.achieved,
    tenantId: nb,
    planId: SUPPORT_PLAN.nbClosed,
    area: "independence",
    statement: "Use a checklist to organise a programming task.",
    measure: "Completes the planning checklist in two consecutive sessions.",
    targetDate: "2026-09-14",
    outcomeIds: [OUTCOME.nbCo1],
    source: "manual",
    aiDraftStatement: null,
    status: "achieved",
    approvedByStaffProfileId: northbridgeLead,
    approvedAt: "2026-08-25T15:00:00Z",
  },
  {
    id: SUPPORT_GOAL.discontinued,
    tenantId: rv,
    planId: SUPPORT_PLAN.rvReview,
    area: "numeracy",
    statement: "Use a worked example to explain two steps of an equation.",
    measure: "Explains both steps in three examples.",
    targetDate: "2026-09-14",
    outcomeIds: [OUTCOME.rvMathAlg],
    source: "manual",
    aiDraftStatement: null,
    status: "discontinued",
    approvedByStaffProfileId: riversideLead,
    approvedAt: "2026-09-02T09:00:00Z",
  },
];

export const ACCOMMODATIONS: readonly Accommodation[] = [
  {
    id: ACCOMMODATION.extraTime,
    tenantId: rv,
    planId: SUPPORT_PLAN.rvReading,
    category: "extra_time",
    details: "Allow 25% additional time for timed work, including tests and exams.",
    appliesTo: "all",
    extraTimePercent: 25,
    active: true,
    startOn: "2026-09-03",
    endOn: null,
  },
];

export const SUPPORT_SESSIONS: readonly SupportSession[] = [
  {
    id: SUPPORT_SESSION.readingPractice,
    tenantId: rv,
    planId: SUPPORT_PLAN.rvReading,
    goalId: SUPPORT_GOAL.active,
    date: "2026-09-11",
    minutes: 20,
    deliveredByStaffProfileId: readingLead,
    note: "Practised finding the main idea using a prompt card.",
  },
  {
    id: SUPPORT_SESSION.planningPractice,
    tenantId: nb,
    planId: SUPPORT_PLAN.nbClosed,
    goalId: SUPPORT_GOAL.achieved,
    date: "2026-09-14",
    minutes: 25,
    deliveredByStaffProfileId: northbridgeLead,
    note: "Completed the planning checklist independently.",
  },
];

const readingProgress = {
  tenantId: rv,
  goalId: SUPPORT_GOAL.active,
  recordedByStaffProfileId: readingLead,
};

export const GOAL_PROGRESS: readonly GoalProgress[] = [
  {
    ...readingProgress,
    id: GOAL_PROGRESS_ID.notStarted,
    recordedOn: "2026-09-03",
    rating: "not_started",
    note: null,
  },
  {
    ...readingProgress,
    id: GOAL_PROGRESS_ID.emerging,
    recordedOn: "2026-09-08",
    rating: "emerging",
    note: "Identified the main idea with a worked example.",
  },
  {
    ...readingProgress,
    id: GOAL_PROGRESS_ID.progressing,
    recordedOn: "2026-09-11",
    rating: "progressing",
    note: "Identified the main idea in two passages using a prompt card.",
  },
  {
    id: GOAL_PROGRESS_ID.achieved,
    tenantId: nb,
    goalId: SUPPORT_GOAL.achieved,
    recordedOn: "2026-09-14",
    rating: "achieved",
    note: "Completed the checklist independently in two consecutive sessions.",
    recordedByStaffProfileId: northbridgeLead,
  },
];
