import {
  AccommodationSchema,
  GoalProgressSchema,
  PAGE_SIZE_MAX,
  SupportGoalSchema,
  SupportPlanSchema,
  SupportSessionSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const SupportPlanPage = pageSchema(SupportPlanSchema);
const SupportGoalPage = pageSchema(SupportGoalSchema);
const AccommodationPage = pageSchema(AccommodationSchema);
const SupportSessionPage = pageSchema(SupportSessionSchema);
const GoalProgressPage = pageSchema(GoalProgressSchema);

export function useSupportPlans(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m38.supportPlans(s, learnerId),
    (c, signal) => c.get("/support-plans", SupportPlanPage, query, { signal }),
  );
}

export function useSupportPlan(planId: string | null) {
  const path = `/support-plans/${encodeURIComponent(planId ?? "")}`;
  return useScopedQuery(
    (s) => queryKeys.m38.supportPlan(s, planId),
    (c, signal) => c.get(path, SupportPlanSchema, undefined, { signal }),
    planId !== null,
  );
}

export function useSupportPlanGoals(planId: string | null) {
  const path = `/support-plans/${encodeURIComponent(planId ?? "")}/goals`;
  return useScopedQuery(
    (s) => queryKeys.m38.supportPlanGoals(s, planId),
    (c, signal) => c.get(path, SupportGoalPage, all, { signal }),
    planId !== null,
  );
}

export function useSupportPlanAccommodations(planId: string | null) {
  const path = `/support-plans/${encodeURIComponent(planId ?? "")}/accommodations`;
  return useScopedQuery(
    (s) => queryKeys.m38.supportPlanAccommodations(s, planId),
    (c, signal) => c.get(path, AccommodationPage, all, { signal }),
    planId !== null,
  );
}

export function useSupportPlanSessions(planId: string | null) {
  const path = `/support-plans/${encodeURIComponent(planId ?? "")}/sessions`;
  return useScopedQuery(
    (s) => queryKeys.m38.supportPlanSessions(s, planId),
    (c, signal) => c.get(path, SupportSessionPage, all, { signal }),
    planId !== null,
  );
}

export function useSupportPlanProgress(planId: string | null) {
  const path = `/support-plans/${encodeURIComponent(planId ?? "")}/progress`;
  return useScopedQuery(
    (s) => queryKeys.m38.supportPlanProgress(s, planId),
    (c, signal) => c.get(path, GoalProgressPage, all, { signal }),
    planId !== null,
  );
}
