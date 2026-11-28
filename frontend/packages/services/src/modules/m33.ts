import {
  AttemptDeliverySchema,
  ItemStatisticSchema,
  OnlineTestSchema,
  QuestionBankSchema,
  QuestionItemSchema,
  TestAttemptSchema,
  TestResponseSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type StartAttemptInput,
  type TestAnswerInput,
  type TestAttempt,
  type TestResponse,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery, useServices } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const QuestionBankPage = pageSchema(QuestionBankSchema);
const QuestionItemPage = pageSchema(QuestionItemSchema);
const OnlineTestPage = pageSchema(OnlineTestSchema);
const TestAttemptPage = pageSchema(TestAttemptSchema);
const TestResponsePage = pageSchema(TestResponseSchema);
const ItemStatisticPage = pageSchema(ItemStatisticSchema);

export function useQuestionBanks() {
  return useScopedQuery(queryKeys.m33.questionBanks, (c, signal) =>
    c.get("/question-banks", QuestionBankPage, all, { signal }),
  );
}

export function useQuestionItems(bankId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m33.questionItems(s, bankId),
    (c, signal) =>
      c.get("/question-items", QuestionItemPage, bankId === null ? all : { ...all, bankId }, {
        signal,
      }),
  );
}

export function useOnlineTests(courseSpaceId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m33.onlineTests(s, courseSpaceId),
    (c, signal) =>
      c.get(
        "/online-tests",
        OnlineTestPage,
        courseSpaceId === null ? all : { ...all, courseSpaceId },
        { signal },
      ),
  );
}

export function useOnlineTest(testId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m33.onlineTest(s, testId),
    (c, signal) =>
      c.get(`/online-tests/${encodeURIComponent(testId ?? "")}`, OnlineTestSchema, undefined, {
        signal,
      }),
    testId !== null,
  );
}

export function useTestAttempts(testId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m33.testAttempts(s, testId),
    (c, signal) =>
      c.get(`/online-tests/${encodeURIComponent(testId ?? "")}/attempts`, TestAttemptPage, all, {
        signal,
      }),
    testId !== null,
  );
}

export function useTestResponses(attemptId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m33.testResponses(s, attemptId),
    (c, signal) =>
      c.get(`/attempts/${encodeURIComponent(attemptId ?? "")}/responses`, TestResponsePage, all, {
        signal,
      }),
    attemptId !== null,
  );
}

export function useItemStatistics(testId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m33.itemStatistics(s, testId),
    (c, signal) =>
      c.get(
        `/online-tests/${encodeURIComponent(testId ?? "")}/item-statistics`,
        ItemStatisticPage,
        all,
        { signal },
      ),
    testId !== null,
  );
}

const attemptPath = (id: string) => `/attempts/${encodeURIComponent(id)}`;

export function useAttemptDelivery(attemptId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m33.attemptDelivery(s, attemptId),
    (c, signal) =>
      c.get(`${attemptPath(attemptId ?? "")}/delivery`, AttemptDeliverySchema, undefined, {
        signal,
      }),
    attemptId !== null,
  );
}

export function useStartAttempt() {
  const { client, scope } = useServices();
  const qc = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ testId, input }: { testId: string; input: StartAttemptInput }) => {
      if (!scope) throw new Error("Sign in before writing");
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Connect to start a test");
      }
      const delivery = await client.send(
        "POST",
        `/online-tests/${encodeURIComponent(testId)}/attempts`,
        input,
        AttemptDeliverySchema,
      );
      if (delivery.attempt.status === "in_progress") {
        qc.setQueryData(queryKeys.m33.attemptDelivery(scope, delivery.attempt.id), delivery);
      }
      await qc.invalidateQueries({ queryKey: queryKeys.m33.testAttempts(scope, testId) });
      return delivery;
    },
  });
}

export function useSaveAnswer() {
  const { scope } = useServices();
  const qc = useQueryClient();
  return useOutboxMutation<
    { attemptId: string; itemId: string; input: TestAnswerInput },
    TestResponse
  >({
    moduleId: "M33",
    operation: "attempt.answer",
    mergeRule: "lww-audited",
    send: async (client, { attemptId, itemId, input }, key) => {
      const answer = await client.send(
        "PUT",
        `${attemptPath(attemptId)}/responses/${encodeURIComponent(itemId)}`,
        input,
        TestResponseSchema,
        { headers: idempotencyHeaders(key) },
      );
      if (scope) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: queryKeys.m33.attemptDelivery(scope, attemptId) }),
          qc.invalidateQueries({ queryKey: queryKeys.m33.testResponses(scope, attemptId) }),
          qc.invalidateQueries({ queryKey: queryKeys.m33.testAttempts(scope, null).slice(0, -2) }),
        ]);
      }
      return answer;
    },
  });
}

export function useSubmitAttempt() {
  const { scope } = useServices();
  const qc = useQueryClient();
  return useOutboxMutation<{ attemptId: string }, TestAttempt>({
    moduleId: "M33",
    operation: "attempt.submit",
    mergeRule: "lww-audited",
    send: async (client, { attemptId }, key) => {
      const attempt = await client.send(
        "POST",
        `${attemptPath(attemptId)}/submit`,
        {},
        TestAttemptSchema,
        {
          headers: idempotencyHeaders(key),
        },
      );
      if (scope) {
        await Promise.all([
          qc.invalidateQueries({
            queryKey: queryKeys.m33.attemptDelivery(scope, attemptId),
            refetchType: "none",
          }),
          qc.invalidateQueries({ queryKey: queryKeys.m33.testResponses(scope, attemptId) }),
          qc.invalidateQueries({ queryKey: queryKeys.m33.testAttempts(scope, attempt.testId) }),
        ]);
        qc.removeQueries({ queryKey: queryKeys.m33.attemptDelivery(scope, attemptId) });
      }
      return attempt;
    },
  });
}
