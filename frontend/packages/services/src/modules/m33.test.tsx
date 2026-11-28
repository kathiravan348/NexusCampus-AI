import { TENANT, USER, mockDb, resetMockDb } from "@nexus/mocks";
import { listOutbox } from "@nexus/offline";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useItemStatistics,
  useOnlineTest,
  useOnlineTests,
  useQuestionBanks,
  useQuestionItems,
  useSaveAnswer,
  useStartAttempt,
  useSubmitAttempt,
  useTestAttempts,
  useTestResponses,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => {
  vi.restoreAllMocks();
  resetMockDb();
});

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

it("queues an answer and submit offline and replays them in order", async () => {
  const scope = { tenantId: TENANT.riverside, userId: USER.rvHelen };
  const previous = mockDb.testAttempts.find((row) => row.tenantId === scope.tenantId)!;
  const test = mockDb.onlineTests.find((row) => row.id === previous.testId)!;
  const learner = mockDb.learners.find((row) => row.id === previous.learnerId)!;
  mockDb.users.find((row) => row.id === scope.userId)!.personId = learner.personId;
  const item = mockDb.questionItems.find(
    (row) => row.tenantId === scope.tenantId && row.status === "approved",
  )!;
  Object.assign(test, {
    sections: [
      {
        id: "section-pool",
        title: "Pool",
        itemIds: [],
        pool: { bankIds: [item.bankId], outcomeIds: item.outcomeIds, itemCount: 1 },
      },
    ],
    status: "open",
    opensAt: "2020-01-01T00:00:00Z",
    closesAt: "2099-01-01T00:00:00Z",
    attemptsAllowed: null,
  });
  signInAs({ ...ADMIN, ...scope });
  const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  const db = freshDb();
  const { result } = renderHook(
    () => ({ start: useStartAttempt(), save: useSaveAnswer(), submit: useSubmitAttempt() }),
    { wrapper: wrapper({ db }) },
  );
  let attemptId = "";
  let itemId = "";
  await act(async () => {
    const delivery = await result.current.start.mutateAsync({
      testId: test.id,
      input: { clientId: globalThis.crypto.randomUUID() },
    });
    attemptId = delivery.attempt.id;
    itemId = delivery.sections[0]!.items[0]!.id;
  });
  online.mockReturnValue(false);
  await act(async () => {
    const answer = await result.current.save.mutateAsync({
      attemptId,
      itemId,
      input: { selectedOptionIds: [], textAnswer: null, numericAnswer: null, flagged: true },
    });
    expect(answer.queued).toBe(true);
    const submit = await result.current.submit.mutateAsync({ attemptId });
    expect(submit.queued).toBe(true);
  });

  const queued = await listOutbox(db, scope);
  expect(queued).toHaveLength(2);
  expect(queued).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ moduleId: "M33", operation: "attempt.answer" }),
      expect.objectContaining({ moduleId: "M33", operation: "attempt.submit" }),
    ]),
  );
  expect(mockDb.testResponses.some((row) => row.attemptId === attemptId)).toBe(false);

  online.mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });

  await waitFor(async () => expect(await listOutbox(db, scope)).toHaveLength(0));
  expect(mockDb.testAttempts.find((row) => row.id === attemptId)?.status).toBe("submitted");
  expect(mockDb.testResponses.find((row) => row.attemptId === attemptId)).toMatchObject({
    itemId,
    flagged: true,
  });
});
