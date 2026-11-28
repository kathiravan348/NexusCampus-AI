import {
  AttemptDeliverySchema,
  ItemStatisticSchema,
  OnlineTestSchema,
  QuestionBankSchema,
  QuestionItemSchema,
  TestAttemptSchema,
  TestResponseSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { roleId } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";
const tenant = TENANT.riverside;

function get(
  path: string,
  userId: string = USER.rvHelen,
  tenantId: string = tenant,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  headers.set(MOCK_HEADER.tenant, tenantId);
  headers.set(MOCK_HEADER.user, userId);
  return fetch(`http://localhost/api/v1${path}`, { ...init, headers });
}
function writeAttempt(path: string, body: unknown = {}, key?: string) {
  return get(path, USER.rvHelen, tenant, {
    method: key ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
    body: JSON.stringify(body),
  });
}

function signInAs(personId: string, role: "learner" | "teacher" | "guardian") {
  const user = mockDb.users.find((row) => row.id === USER.rvHelen)!;
  user.personId = personId;
  const assignment = mockDb.roleAssignments.find((row) => row.userId === user.id)!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== user.id);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenant, role) });
}

function practice() {
  const attempt = mockDb.testAttempts.find((row) => row.tenantId === tenant)!;
  const test = mockDb.onlineTests.find((row) => row.id === attempt.testId)!;
  const bank = mockDb.questionBanks.find((row) => row.tenantId === tenant)!;
  const learner = mockDb.learners.find((row) => row.id === attempt.learnerId)!;
  const space = mockDb.courseSpaces.find((row) => row.id === test.courseSpaceId)!;
  return { attempt, test, bank, learner, space, path: `/online-tests/${test.id}` };
}

function addOtherAttempt(attempt: ReturnType<typeof practice>["attempt"]) {
  const learner = mockDb.learners.find(
    (row) => row.tenantId === tenant && row.id !== attempt.learnerId,
  )!;
  const other = {
    ...attempt,
    id: "attempt-other",
    learnerId: learner.id,
    clientId: "44444444-4444-4444-8444-000000000099",
  };
  mockDb.testAttempts.push(other);
  return other;
}

async function parse<T>(response: Response, schema: Parser<T>, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  return schema.parse(await response.json());
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  vi.restoreAllMocks();
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M33 read handlers", () => {
  it("serves all question-bank and test endpoints to an admin", async () => {
    const { attempt, test, bank, path } = practice();
    const banks = await parse(await get("/question-banks"), pageSchema(QuestionBankSchema));
    expect(banks.items).toEqual([bank]);
    const items = await parse(
      await get(`/question-items?bankId=${bank.id}`),
      pageSchema(QuestionItemSchema),
    );
    expect(items.total).toBe(4);
    expect(items.items.every((row) => row.bankId === bank.id)).toBe(true);
    const tests = await parse(
      await get(`/online-tests?courseSpaceId=${test.courseSpaceId}`),
      pageSchema(OnlineTestSchema),
    );
    expect(tests.items).toEqual([test]);
    expect(await parse(await get(path), OnlineTestSchema)).toEqual(test);
    const attempts = await parse(await get(`${path}/attempts`), pageSchema(TestAttemptSchema));
    expect(attempts.items).toEqual([attempt]);
    const responses = await parse(
      await get(`/attempts/${attempt.id}/responses`),
      pageSchema(TestResponseSchema),
    );
    expect(responses.total).toBe(3);
    const statistics = await parse(
      await get(`${path}/item-statistics`),
      pageSchema(ItemStatisticSchema),
    );
    expect(statistics.items[0]?.testId).toBe(test.id);
  });

  it("limits learners to their visible tests and own attempts without bank access", async () => {
    const { attempt, test, bank, learner, path } = practice();
    signInAs(learner.personId, "learner");
    const other = addOtherAttempt(attempt);
    mockDb.onlineTests.push({ ...test, id: "test-draft", status: "draft" });
    const tests = await parse(await get("/online-tests"), pageSchema(OnlineTestSchema));
    expect(tests.items).toEqual([test]);
    expect((await get("/online-tests/test-draft")).status).toBe(404);
    const attempts = await parse(await get(`${path}/attempts`), pageSchema(TestAttemptSchema));
    expect(attempts.items).toEqual([attempt]);
    expect((await get(`/attempts/${other.id}/responses`)).status).toBe(404);
    expect((await get("/question-banks")).status).toBe(403);
    expect((await get(`/question-items?bankId=${bank.id}`)).status).toBe(403);
    expect((await get(`${path}/item-statistics`)).status).toBe(403);
  });

  it.each([
    ["immediately", "open", true],
    ["after_close", "open", false],
    ["after_close", "closed", true],
    ["manual", "closed", false],
  ] as const)("applies %s result visibility when the test is %s", async (policy, status, shown) => {
    const { attempt, test, learner, space } = practice();
    signInAs(learner.personId, "learner");
    test.showResults = policy;
    test.status = status;
    const response = mockDb.testResponses.find((row) => row.attemptId === attempt.id)!;
    response.manualScore = 1;
    response.markedByStaffProfileId = space.staffProfileIds[0]!;
    const responses = await parse(
      await get(`/attempts/${attempt.id}/responses`),
      pageSchema(TestResponseSchema),
    );
    expect(responses.items[0]).toEqual(
      shown
        ? response
        : { ...response, autoScore: null, manualScore: null, markedByStaffProfileId: null },
    );
  });

  it("lets a teacher of the space read all attempts and scores", async () => {
    const { attempt, test, space, path } = practice();
    const staff = mockDb.roleProfiles.find((row) => space.staffProfileIds.includes(row.id))!;
    signInAs(staff.personId, "teacher");
    const teacherRole = mockDb.roles.find((row) => row.id === roleId(tenant, "teacher"))!;
    teacherRole.permissions = teacherRole.permissions.filter((code) => code !== "m33.test.manage");
    const other = addOtherAttempt(attempt);
    test.showResults = "manual";
    const attempts = await parse(await get(`${path}/attempts`), pageSchema(TestAttemptSchema));
    expect(attempts.items).toEqual([attempt, other]);
    const responses = await parse(
      await get(`/attempts/${attempt.id}/responses`),
      pageSchema(TestResponseSchema),
    );
    expect(responses.items).toEqual(
      mockDb.testResponses.filter((row) => row.attemptId === attempt.id),
    );
  });

  it("returns 404 for foreign bank, course, test and attempt IDs", async () => {
    const { attempt, test, bank, path } = practice();
    for (const route of [
      `/question-items?bankId=${bank.id}`,
      `/online-tests?courseSpaceId=${test.courseSpaceId}`,
      path,
      `${path}/attempts`,
      `${path}/item-statistics`,
      `/attempts/${attempt.id}/responses`,
    ]) {
      expect((await get(route, USER.lsPriya, TENANT.littleSteps)).status).toBe(404);
    }
  });

  it("requires test read permission and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    const forbidden = await get("/online-tests");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M33",
    );
    const disabled = await get("/online-tests");
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
function startTest() {
  const { test, learner, path } = practice();
  signInAs(learner.personId, "learner");
  const item = mockDb.questionItems.find(
    (row) =>
      row.tenantId === tenant && row.status === "approved" && row.options.some((o) => o.correct),
  )!;
  Object.assign(test, {
    sections: [{ id: "section-choice", title: "Choice", itemIds: [item.id], pool: null }],
    status: "open",
    opensAt: "2020-01-01T00:00:00Z",
    closesAt: "2099-01-01T00:00:00Z",
    timeLimitMinutes: 10,
    attemptsAllowed: 2,
    showResults: "after_close",
  });
  return { test, path, learner };
}
const clientId = "44444444-4444-4444-8444-000000000101";
const nextId = "44444444-4444-4444-8444-000000000102";
const answer = { selectedOptionIds: [], textAnswer: null, numericAnswer: null, flagged: false };
const begin = (path: string, id = clientId) => writeAttempt(`${path}/attempts`, { clientId: id });

it("starts, saves and submits an attempt with results hidden until close", async () => {
  const { test, path } = startTest();
  const delivery = await parse(await begin(path), AttemptDeliverySchema, 201);
  const attemptPath = `/attempts/${delivery.attempt.id}`;
  expect(await parse(await get(`${attemptPath}/delivery`), AttemptDeliverySchema)).toEqual(
    delivery,
  );
  expect(await parse(await begin(path), AttemptDeliverySchema)).toEqual(delivery);
  expect((await begin(path, nextId)).status).toBe(409);
  const item = mockDb.questionItems.find((row) => row.id === delivery.sections[0]?.items[0]?.id)!;
  const correct = item.options.filter((option) => option.correct).map((option) => option.id);
  const responsePath = `${attemptPath}/responses/${item.id}`;
  const invalid = await writeAttempt(
    responsePath,
    { ...answer, selectedOptionIds: ["unknown"], textAnswer: "private sample" },
    "invalid",
  );
  expect(invalid.status).toBe(422);
  const error = await invalid.json();
  expect(error).toMatchObject({ error: { details: [{ path: "selectedOptionIds" }] } });
  expect(JSON.stringify(error)).not.toContain("private sample");
  const save = (key: string, flagged: boolean) =>
    writeAttempt(responsePath, { ...answer, selectedOptionIds: correct, flagged }, key);
  const saved = await parse(await save("one", false), TestResponseSchema);
  expect(await parse(await save("two", true), TestResponseSchema)).toMatchObject({
    id: saved.id,
    flagged: true,
  });
  expect(await parse(await save("one", false), TestResponseSchema)).toEqual(saved);
  const submit = () => writeAttempt(`${attemptPath}/submit`);
  const submitted = await parse(await submit(), TestAttemptSchema);
  expect(submitted).toMatchObject({ status: "submitted", scorePoints: null });
  expect(await parse(await submit(), TestAttemptSchema)).toEqual(submitted);
  expect((await begin(path, nextId)).status).toBe(409);
  const responses = () => get(`${attemptPath}/responses`);
  const page = pageSchema(TestResponseSchema);
  const score = async () => (await parse(await responses(), page)).items[0]?.autoScore;
  expect(await score()).toBeNull();
  test.status = "closed";
  expect(await score()).toBe(item.maxPoints);
});

it("rejects late answers and auto-submits after the deadline", async () => {
  const { path } = startTest();
  const { attempt, deadlineAt, sections } = await parse(
    await begin(path),
    AttemptDeliverySchema,
    201,
  );
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(deadlineAt!) + 1);
  const url = `/attempts/${attempt.id}`;
  const itemId = sections[0]!.items[0]!.id;
  const late = await writeAttempt(`${url}/responses/${itemId}`, answer, "late");
  expect(late.status).toBe(409);
  const submitted = await parse(await writeAttempt(`${url}/submit`, {}), TestAttemptSchema);
  expect(submitted.status).toBe("auto_submitted");
});

it("rejects staff, linked guardians, foreign viewers and missing permission", async () => {
  const { learner, path } = startTest();
  const { space } = practice();
  const teacher = mockDb.roleProfiles.find((row) => space.staffProfileIds.includes(row.id))!;
  signInAs(teacher.personId, "teacher");
  expect((await begin(path)).status).toBe(404);
  const link = mockDb.guardianLinks.find((row) => row.learnerPersonId === learner.personId)!;
  signInAs(link.guardianPersonId, "guardian");
  const guardian = mockDb.roles.find((row) => row.id === roleId(tenant, "guardian"))!;
  guardian.permissions = [...guardian.permissions, "m33.test.read"];
  expect((await begin(path)).status).toBe(404);
  expect(
    (await get(`${path}/attempts`, USER.lsPriya, TENANT.littleSteps, { method: "POST" })).status,
  ).toBe(404);
  signInAs(learner.personId, "learner");
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
  expect((await begin(path)).status).toBe(403);
});
