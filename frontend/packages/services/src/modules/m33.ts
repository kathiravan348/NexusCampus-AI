import {
  ItemStatisticSchema,
  OnlineTestSchema,
  QuestionBankSchema,
  QuestionItemSchema,
  TestAttemptSchema,
  TestResponseSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

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
