import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useSupportPlan,
  useSupportPlanAccommodations,
  useSupportPlanGoals,
  useSupportPlanProgress,
  useSupportPlans,
  useSupportPlanSessions,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M38 hooks", () => {
  it("loads support plans, goals, accommodations, sessions and goal progress", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const plans = useSupportPlans();
        const firstPlan = plans.data?.items[0];
        const planId = firstPlan?.id ?? null;
        const learnerId = firstPlan?.learnerId ?? null;
        return {
          plans,
          plansByLearner: useSupportPlans(learnerId),
          plan: useSupportPlan(planId),
          goals: useSupportPlanGoals(planId),
          accommodations: useSupportPlanAccommodations(planId),
          sessions: useSupportPlanSessions(planId),
          progress: useSupportPlanProgress(planId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { plans, plansByLearner, plan, goals, accommodations, sessions, progress } =
        result.current;
      expect(plans.data?.total).toBe(2);
      expect(plansByLearner.data?.items).toHaveLength(1);
      expect(plan.data?.kind).toBe("iep");
      expect(goals.data?.total).toBe(1);
      expect(accommodations.data?.total).toBe(1);
      expect(sessions.data?.total).toBe(1);
      expect(progress.data?.total).toBe(3);
    });
  });
});
