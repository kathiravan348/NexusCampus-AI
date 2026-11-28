import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEngagementSnapshots, useInterventions, useRiskScore, useRiskScores } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M46 hooks", () => {
  it("loads engagement snapshots, active risk scores and interventions", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const engagement = useEngagementSnapshots();
        const riskScores = useRiskScores();
        const interventions = useInterventions();
        const score = riskScores.data?.items[0];
        const learnerId = score?.learnerId ?? null;
        const riskScoreId = score?.id ?? null;
        const interventionLearnerId = interventions.data?.items[0]?.learnerId ?? null;
        return {
          engagement,
          engagementByLearner: useEngagementSnapshots(learnerId),
          riskScores,
          riskScoresByFilter: useRiskScores(learnerId, "low"),
          highRiskScores: useRiskScores(null, "high"),
          riskScore: useRiskScore(riskScoreId),
          interventions,
          interventionsByLearner: useInterventions(interventionLearnerId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const {
        engagement,
        engagementByLearner,
        riskScores,
        riskScoresByFilter,
        highRiskScores,
        riskScore,
        interventions,
        interventionsByLearner,
      } = result.current;
      expect(engagement.data?.total).toBe(2);
      expect(engagementByLearner.data?.items).toHaveLength(1);
      expect(riskScores.data?.total).toBe(1);
      expect(riskScoresByFilter.data?.items).toEqual(riskScores.data?.items);
      expect(highRiskScores.data?.total).toBe(0);
      expect(riskScore.data?.aiGenerated).toBe(true);
      expect(riskScore.data?.level).toBe("low");
      expect(interventions.data?.total).toBe(1);
      expect(interventionsByLearner.data?.items).toEqual(interventions.data?.items);
    });
  });
});
