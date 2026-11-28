import {
  ItemStatisticSchema,
  OnlineTestSchema,
  QuestionBankSchema,
  QuestionItemSchema,
  TestAttemptSchema,
  TestResponseSchema,
  pageSchema,
  type OnlineTest,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { learningSpaceAccess } from "./m32";
import { found, get, list, ok, param } from "./route";

const M = { module: "M33", permission: "m33.test.read" } as const;
const MANAGE = "m33.test.manage";

function banksFor(viewer: Viewer) {
  if (
    !viewer.permissions.has("m33.bank.manage") ||
    ofTenant(mockDb.learners, viewer.tenantId).some((row) => row.personId === viewer.personId)
  ) {
    throw new ApiFailure("forbidden");
  }
  return ofTenant(mockDb.questionBanks, viewer.tenantId);
}

function testAccess(viewer: Viewer) {
  const { tenantId } = viewer;
  const { manage, spaces, spaceById, readClassRows, learnerIds } = learningSpaceAccess(
    viewer,
    MANAGE,
  );
  const spaceIds = new Set(spaces.map((space) => space.id));
  const tests = ofTenant(mockDb.onlineTests, tenantId).filter(
    (row) =>
      (row.courseSpaceId === null ? manage : spaceIds.has(row.courseSpaceId)) &&
      (manage || row.status !== "draft"),
  );
  const testById = (id: string | undefined) => found(tests.find((row) => row.id === id));
  const canReadClass = (test: OnlineTest) =>
    readClassRows(test.courseSpaceId === null ? null : spaceById(test.courseSpaceId));

  function attemptsOf(test: OnlineTest) {
    const staff = canReadClass(test);
    return ofTenant(mockDb.testAttempts, tenantId).filter(
      (row) => row.testId === test.id && (staff || learnerIds.has(row.learnerId)),
    );
  }

  return { tests, testById, spaceById, canReadClass, attemptsOf };
}

function resultsVisible(test: OnlineTest): boolean {
  return (
    test.showResults === "immediately" ||
    (test.showResults === "after_close" && test.status === "closed")
  );
}

export const m33Handlers = [
  get("/question-banks", M, (ctx) =>
    list(ctx, banksFor(ctx.viewer), pageSchema(QuestionBankSchema)),
  ),
  get("/question-items", M, (ctx) => {
    const banks = banksFor(ctx.viewer);
    const bankId = param(ctx.url, "bankId");
    if (bankId !== null) found(banks.find((row) => row.id === bankId));
    const bankIds = new Set(banks.map((row) => row.id));
    const rows = ofTenant(mockDb.questionItems, ctx.viewer.tenantId).filter(
      (row) => bankIds.has(row.bankId) && (bankId === null || row.bankId === bankId),
    );
    return list(ctx, rows, pageSchema(QuestionItemSchema));
  }),
  get("/online-tests", M, (ctx) => {
    const { tests, spaceById } = testAccess(ctx.viewer);
    const courseSpaceId = param(ctx.url, "courseSpaceId");
    if (courseSpaceId !== null) spaceById(courseSpaceId);
    const rows = tests.filter(
      (row) => courseSpaceId === null || row.courseSpaceId === courseSpaceId,
    );
    return list(ctx, rows, pageSchema(OnlineTestSchema));
  }),
  get("/online-tests/:id", M, (ctx) =>
    ok(OnlineTestSchema, testAccess(ctx.viewer).testById(ctx.params["id"])),
  ),
  get("/online-tests/:id/attempts", M, (ctx) => {
    const { testById, attemptsOf } = testAccess(ctx.viewer);
    return list(ctx, attemptsOf(testById(ctx.params["id"])), pageSchema(TestAttemptSchema));
  }),
  get("/attempts/:id/responses", M, (ctx) => {
    const { tenantId } = ctx.viewer;
    const { testById, canReadClass, attemptsOf } = testAccess(ctx.viewer);
    const attempt = found(
      ofTenant(mockDb.testAttempts, tenantId).find((row) => row.id === ctx.params["id"]),
    );
    const test = testById(attempt.testId);
    found(attemptsOf(test).find((row) => row.id === attempt.id));
    const rows = ofTenant(mockDb.testResponses, tenantId).filter(
      (row) => row.attemptId === attempt.id,
    );
    const visible = canReadClass(test) || resultsVisible(test);
    return list(
      ctx,
      visible
        ? rows
        : rows.map((row) => ({
            ...row,
            autoScore: null,
            manualScore: null,
            markedByStaffProfileId: null,
          })),
      pageSchema(TestResponseSchema),
    );
  }),
  get("/online-tests/:id/item-statistics", M, (ctx) => {
    if (!ctx.viewer.permissions.has(MANAGE)) throw new ApiFailure("forbidden");
    const test = testAccess(ctx.viewer).testById(ctx.params["id"]);
    const rows = ofTenant(mockDb.itemStatistics, ctx.viewer.tenantId).filter(
      (row) => row.testId === test.id,
    );
    return list(ctx, rows, pageSchema(ItemStatisticSchema));
  }),
];
