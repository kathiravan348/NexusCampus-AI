import {
  ItemStatisticSchema,
  OnlineTestSchema,
  QuestionBankSchema,
  QuestionItemSchema,
  TestAttemptSchema,
  TestResponseSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { roleId } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

const tenant = TENANT.riverside;

function get(path: string, userId: string = USER.rvHelen, tenantId: string = tenant) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function signInAs(personId: string, role: "learner" | "teacher") {
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

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  expect(response.status).toBe(200);
  return schema.parse(await response.json());
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
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
