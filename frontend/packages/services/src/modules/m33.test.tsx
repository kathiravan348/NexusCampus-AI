import { TENANT, USER, resetMockDb } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useItemStatistics,
  useOnlineTest,
  useOnlineTests,
  useQuestionBanks,
  useQuestionItems,
  useTestAttempts,
  useTestResponses,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M33 hooks", () => {
  it("loads banks, scoped items, tests, attempts, responses and statistics", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const banks = useQuestionBanks();
        const tests = useOnlineTests();
        const test = tests.data?.items[0];
        const testId = test?.id ?? null;
        const attempts = useTestAttempts(testId);
        return {
          banks,
          tests,
          attempts,
          items: useQuestionItems(banks.data?.items[0]?.id ?? null),
          filtered: useOnlineTests(test?.courseSpaceId ?? null),
          detail: useOnlineTest(testId),
          responses: useTestResponses(attempts.data?.items[0]?.id ?? null),
          statistics: useItemStatistics(testId),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { banks, tests, attempts, items, filtered, detail, responses, statistics } =
        result.current;
      expect(banks.data?.items[0]?.code).toBe("RV-MATH");
      expect(items.data?.total).toBe(4);
      expect(tests.data?.total).toBe(1);
      expect(detail.data?.title).toBe("Fractions Practice");
      expect(filtered.data?.items).toEqual([detail.data]);
      expect(attempts.data?.items[0]?.scorePoints).toBe(6);
      expect(responses.data?.total).toBe(3);
      expect(statistics.data?.total).toBe(1);
    });
  });
});
