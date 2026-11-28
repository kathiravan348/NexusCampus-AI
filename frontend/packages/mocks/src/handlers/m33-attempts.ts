import {
  AttemptDeliverySchema,
  QuestionItemSchema,
  StartAttemptInputSchema,
  TestAnswerInputSchema,
  TestAttemptSchema,
  TestResponseSchema,
  type OnlineTest,
  type QuestionDelivery,
  type QuestionItem,
  type TestAttempt,
  type TestResponse,
} from "@nexus/contracts";
import { HttpResponse } from "msw";
import { z } from "zod";
import { ApiFailure, apiError, ofTenant } from "../context";
import { mockDb as db } from "../db";
import { found, ok } from "./route";

export function resultsVisible(test: OnlineTest): boolean {
  return (
    test.showResults === "immediately" ||
    (test.showResults === "after_close" && test.status === "closed")
  );
}

function shuffled<T>(values: readonly T[], seed: string): T[] {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  const result = [...values];
  for (let remaining = result.length; remaining > 1; remaining--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const index = Math.floor((state / 2 ** 32) * remaining);
    const last = remaining - 1;
    const value = result[last]!;
    result[last] = result[index]!;
    result[index] = value;
  }
  return result;
}

function deliverItem(item: QuestionItem, seed: string, shuffleOptions: boolean): QuestionDelivery {
  const { id, kind, stem, language, maxPoints, negativePoints } = item;
  const original = item.options.map(({ id, text }) => ({ id, text }));
  const options = shuffleOptions || kind === "order" ? shuffled(original, seed) : original;
  return { id, kind, stem, language, maxPoints, negativePoints, options };
}

function makeSnapshot(attemptId: string, test: OnlineTest, startedAt: number) {
  const approved = ofTenant(db.questionItems, test.tenantId).filter(
    (row) => row.status === "approved",
  );
  const byId = new Map(approved.map((item) => [item.id, item]));
  const items = new Map<string, QuestionItem>();
  const sections = test.sections.map(({ id, title, itemIds, pool }) => {
    const seed = `${attemptId}:${id}`;
    let selected: QuestionItem[];
    if (pool) {
      const candidates = approved.filter(
        (item) =>
          pool.bankIds.includes(item.bankId) &&
          (pool.outcomeIds.length === 0 ||
            item.outcomeIds.some((outcome) => pool.outcomeIds.includes(outcome))),
      );
      if (candidates.length < pool.itemCount) throw new ApiFailure("conflict");
      selected = shuffled(candidates, seed).slice(0, pool.itemCount);
    } else {
      selected = itemIds.map((itemId) => found(byId.get(itemId)));
    }
    return {
      id,
      title,
      items: selected.map((item) => {
        items.set(item.id, QuestionItemSchema.parse(item));
        return deliverItem(item, `${seed}:${item.id}`, test.shuffleOptions);
      }),
    };
  });
  const closes = Date.parse(test.closesAt);
  const deadline =
    test.timeLimitMinutes === null
      ? closes
      : Math.min(closes, startedAt + test.timeLimitMinutes * 60_000);
  return { sections, items, deadline, deadlineAt: new Date(deadline).toISOString() };
}

const snapshots = new WeakMap<TestAttempt, ReturnType<typeof makeSnapshot>>();
const answerReceipts = new WeakMap<TestAttempt, Map<string, TestResponse>>();

function snapshotOf(attempt: TestAttempt, test: OnlineTest) {
  const saved = snapshots.get(attempt);
  if (saved) return saved;
  const snapshot = makeSnapshot(attempt.id, test, Date.parse(attempt.startedAt));
  snapshots.set(attempt, snapshot);
  return snapshot;
}

function answersOf(attempt: TestAttempt) {
  return ofTenant(db.testResponses, attempt.tenantId).filter((row) => row.attemptId === attempt.id);
}

function learnerAttempt(attempt: TestAttempt, test: OnlineTest): TestAttempt {
  if (resultsVisible(test) || attempt.scorePoints === null) return attempt;
  if (attempt.status === "marked" || attempt.status === "released")
    throw new ApiFailure("not_found");
  return { ...attempt, scorePoints: null };
}

function delivery(attempt: TestAttempt, test: OnlineTest) {
  const { sections, deadlineAt } = snapshotOf(attempt, test);
  const visible = resultsVisible(test);
  return AttemptDeliverySchema.parse({
    attempt: learnerAttempt(attempt, test),
    sections,
    deadlineAt,
    answers: answersOf(attempt).map((row) =>
      visible ? row : { ...row, autoScore: null, manualScore: null, markedByStaffProfileId: null },
    ),
  });
}

type AttemptAccess = { attempt: TestAttempt; test: OnlineTest };
const EmptyInput = z.strictObject({});

export function startAttempt(test: OnlineTest, learnerId: string, raw: unknown) {
  const parsed = StartAttemptInputSchema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure("invalid_request");
  const { clientId } = parsed.data;
  const attempts = ofTenant(db.testAttempts, test.tenantId).filter(
    (row) => row.learnerId === learnerId && row.testId === test.id,
  );
  const retry = attempts.find((row) => row.clientId === clientId);
  if (retry) return HttpResponse.json(delivery(retry, test));
  const now = Date.now();
  if (
    test.status !== "open" ||
    now < Date.parse(test.opensAt) ||
    now >= Date.parse(test.closesAt) ||
    (test.attemptsAllowed !== null && attempts.length >= test.attemptsAllowed) ||
    attempts.some((row) => row.status === "in_progress")
  )
    throw new ApiFailure("conflict");
  const attemptId = `attempt-${globalThis.crypto.randomUUID()}`;
  const snapshot = makeSnapshot(attemptId, test, now);
  const attempt = TestAttemptSchema.parse({
    id: attemptId,
    tenantId: test.tenantId,
    testId: test.id,
    learnerId,
    attemptNumber: attempts.reduce((max, row) => Math.max(max, row.attemptNumber), 0) + 1,
    status: "in_progress",
    startedAt: new Date(now).toISOString(),
    submittedAt: null,
    scorePoints: null,
    maxPoints: [...snapshot.items.values()].reduce((sum, item) => sum + item.maxPoints, 0),
    clientId,
    deviceId: null,
  });
  snapshots.set(attempt, snapshot);
  const payload = delivery(attempt, test);
  db.testAttempts.push(attempt);
  return HttpResponse.json(payload, { status: 201 });
}

export function saveAnswer(
  { attempt, test }: AttemptAccess,
  itemId: unknown,
  raw: unknown,
  key: string | null,
) {
  if (attempt.status !== "in_progress") throw new ApiFailure("not_found");
  const { items, deadline } = snapshotOf(attempt, test);
  const item = found(typeof itemId === "string" ? items.get(itemId) : undefined);
  if (!key) throw new ApiFailure("invalid_request");
  const receipts = answerReceipts.get(attempt) ?? new Map<string, TestResponse>();
  const receiptKey = JSON.stringify([item.id, key]);
  const receipt = receipts.get(receiptKey);
  if (receipt) return ok(TestResponseSchema, receipt);
  const now = Date.now();
  if (now >= deadline) throw new ApiFailure("conflict");
  const parsed = TestAnswerInputSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      422,
      "invalid_request",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: "Invalid answer field",
      })),
    );
  }
  if (
    parsed.data.selectedOptionIds.some((id) => !item.options.some((option) => option.id === id))
  ) {
    return apiError(422, "invalid_request", [
      { path: "selectedOptionIds", message: "Invalid option" },
    ]);
  }
  const existing = answersOf(attempt).find((row) => row.itemId === item.id);
  const response = TestResponseSchema.parse({
    ...parsed.data,
    id: existing?.id ?? `response-${globalThis.crypto.randomUUID()}`,
    tenantId: test.tenantId,
    attemptId: attempt.id,
    itemId: item.id,
    autoScore: null,
    manualScore: null,
    markedByStaffProfileId: null,
    answeredAt: new Date(now).toISOString(),
  });
  if (existing) db.testResponses[db.testResponses.indexOf(existing)] = response;
  else db.testResponses.push(response);
  receipts.set(receiptKey, response);
  answerReceipts.set(attempt, receipts);
  return ok(TestResponseSchema, response);
}

const roundPoints = (points: number) => Math.round(points * 100) / 100;
const normalizeText = (text: string) => text.trim().toLowerCase();

function score(item: QuestionItem, answer: TestResponse): number | null {
  const { kind, maxPoints, negativePoints, options } = item;
  const { numericAnswer, textAnswer, selectedOptionIds } = answer;
  const wrong = negativePoints === 0 ? 0 : -negativePoints;
  switch (kind) {
    case "essay":
      return null;
    case "numeric": {
      if (numericAnswer === null) return 0;
      const target = item.numericAnswer;
      return target && Math.abs(numericAnswer - target.value) <= target.tolerance
        ? maxPoints
        : wrong;
    }
    case "short_text": {
      if (!textAnswer?.trim()) return 0;
      return item.acceptedAnswers.some(
        (value) => normalizeText(value) === normalizeText(textAnswer),
      )
        ? maxPoints
        : wrong;
    }
    case "order":
      return roundPoints(
        (maxPoints *
          options.filter((option, index) => option.id === selectedOptionIds[index]).length) /
          options.length,
      );
    default: {
      if (selectedOptionIds.length === 0) return 0;
      const correct = options.filter((option) => option.correct);
      return selectedOptionIds.length === correct.length &&
        correct.every((option) => selectedOptionIds.includes(option.id))
        ? maxPoints
        : wrong;
    }
  }
}

export function submitAttempt({ attempt, test }: AttemptAccess, raw: unknown) {
  if (!EmptyInput.safeParse(raw).success) throw new ApiFailure("invalid_request");
  if (attempt.status !== "in_progress") return ok(TestAttemptSchema, learnerAttempt(attempt, test));
  const { items, deadline } = snapshotOf(attempt, test);
  const now = Date.now();
  const scored = answersOf(attempt).map((row) => ({
    row,
    autoScore: score(found(items.get(row.itemId)), row),
  }));
  const updated = TestAttemptSchema.parse({
    ...attempt,
    status: now > deadline ? "auto_submitted" : "submitted",
    submittedAt: new Date(now).toISOString(),
    scorePoints:
      resultsVisible(test) && ![...items.values()].some((item) => item.kind === "essay")
        ? roundPoints(scored.reduce((sum, row) => sum + (row.autoScore ?? 0), 0))
        : null,
  });
  for (const { row, autoScore } of scored) row.autoScore = autoScore;
  Object.assign(attempt, updated);
  return ok(TestAttemptSchema, updated);
}

export function getDelivery({ attempt, test }: AttemptAccess) {
  if (attempt.status !== "in_progress") throw new ApiFailure("not_found");
  return ok(AttemptDeliverySchema, delivery(attempt, test));
}
