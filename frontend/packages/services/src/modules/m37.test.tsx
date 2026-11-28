import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useDaySummaries,
  useDiaryEntries,
  useMilestoneProgress,
  useObservations,
  usePickupChecks,
  useRatioSnapshots,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M37 hooks", () => {
  it("loads diary, observations, milestones, summaries, pick-ups and ratios", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.littleSteps, userId: USER.lsPriya });
    const { result } = renderHook(
      () => {
        const diary = useDiaryEntries();
        const observations = useObservations();
        const milestones = useMilestoneProgress();
        const summaries = useDaySummaries();
        const pickups = usePickupChecks();
        const ratios = useRatioSnapshots();
        const firstDiary = diary.data?.items[0];
        const obsLearnerId = observations.data?.items[0]?.learnerIds[0] ?? null;
        const milestoneLearnerId = milestones.data?.items[0]?.learnerId ?? null;
        const summaryLearnerId = summaries.data?.items[0]?.learnerId ?? null;
        const firstPickup = pickups.data?.items[0];
        return {
          diary,
          diaryFiltered: useDiaryEntries(firstDiary?.learnerId ?? null, firstDiary?.date ?? null),
          observations,
          observationsByLearner: useObservations(obsLearnerId),
          milestones,
          milestonesByLearner: useMilestoneProgress(milestoneLearnerId),
          summaries,
          summariesByLearner: useDaySummaries(summaryLearnerId),
          pickups,
          pickupsFiltered: usePickupChecks(
            firstPickup?.learnerId ?? null,
            firstPickup?.date ?? null,
          ),
          ratios,
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const {
        diary,
        diaryFiltered,
        observations,
        observationsByLearner,
        milestones,
        milestonesByLearner,
        summaries,
        summariesByLearner,
        pickups,
        pickupsFiltered,
        ratios,
      } = result.current;
      expect(diary.data?.total).toBe(7);
      expect(diaryFiltered.data?.items).toHaveLength(4);
      expect(observations.data?.total).toBe(1);
      expect(observationsByLearner.data?.items).toHaveLength(1);
      expect(milestones.data?.total).toBe(3);
      expect(milestonesByLearner.data?.items).toHaveLength(3);
      expect(summaries.data?.total).toBe(2);
      expect(summariesByLearner.data?.items).toHaveLength(1);
      expect(pickups.data?.total).toBe(5);
      expect(pickupsFiltered.data?.items).toHaveLength(3);
      expect(ratios.data?.total).toBe(2);
    });
  });
});
