import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useLessonPlans,
  useOutcomeFrameworks,
  useOutcomeMappings,
  useOutcomes,
  useSyllabusCoverage,
  useSyllabusUnits,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M29 hooks", () => {
  it("loads curriculum, lesson plans and computed coverage through their schemas", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const frameworks = useOutcomeFrameworks();
        const frameworkId = frameworks.data?.items[0]?.id ?? null;
        const outcomes = useOutcomes(frameworkId);
        const units = useSyllabusUnits();
        const plans = useLessonPlans();
        const offeringId = plans.data?.items[0]?.subjectOfferingId ?? null;
        const coverage = useSyllabusCoverage(offeringId);
        return {
          frameworks,
          outcomes,
          mappings: useOutcomeMappings(frameworkId),
          units,
          plans,
          coverage,
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { frameworks, outcomes, mappings, units, plans, coverage } = result.current;
      expect(frameworks.data?.total).toBe(1);
      expect(outcomes.data?.total).toBe(6);
      expect(mappings.data?.total).toBe(0);
      expect(units.data?.total).toBe(4);
      expect(plans.data?.total).toBe(5);
      expect(coverage.data?.coverage).toMatchObject({
        topicsTotal: 2,
        topicsCovered: 1,
        percentBps: 5000,
      });
      expect(coverage.data?.entries).toHaveLength(2);
    });
  });
});
