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
import { http } from "msw";
import {
  ApiFailure,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { learningSpaceAccess } from "./m32";
import {
  getDelivery,
  resultsVisible,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from "./m33-attempts";
import { API_BASE, found, get, list, ok, param } from "./route";

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

function learnerTest(viewer: Viewer, id: unknown, learnerId?: string) {
  const { tenantId, personId } = viewer;
  const learner = found(
    ofTenant(mockDb.learners, tenantId).find(
      (row) => row.personId === personId && (learnerId === undefined || row.id === learnerId),
    ),
  );
  const test = found(
    ofTenant(mockDb.onlineTests, tenantId).find((row) => row.id === id && row.status !== "draft"),
  );
  const space = found(
    ofTenant(mockDb.courseSpaces, tenantId).find(
      (row) => row.id === test.courseSpaceId && row.status === "published",
    ),
  );
  found(
    ofTenant(mockDb.enrolments, tenantId).find(
      (row) =>
        row.learnerId === learner.id &&
        row.classGroupId !== null &&
        space.classGroupIds.includes(row.classGroupId) &&
        (space.academicYearId === null || row.academicYearId === space.academicYearId),
    ),
  );
  return { learner, test };
}

function ownAttempt(viewer: Viewer, id: unknown) {
  const attempt = found(
    ofTenant(mockDb.testAttempts, viewer.tenantId).find((row) => row.id === id),
  );
  const { test } = learnerTest(viewer, attempt.testId, attempt.learnerId);
  return { attempt, test };
}

async function runWrite(
  request: Request,
  handle: (viewer: Viewer, raw: unknown, key: string | null) => Response,
) {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readViewer(request);
    if (!entitled(viewer.tenantId, M.module)) throw new ApiFailure("module_disabled");
    if (!viewer.permissions.has(M.permission)) throw new ApiFailure("forbidden");
    const body = await request.text();
    let raw: unknown = body === "" ? {} : undefined;
    if (body !== "") {
      try {
        raw = JSON.parse(body) as unknown;
      } catch {
        // The input schema reports a generic error without reflecting the request body.
      }
    }
    return handle(viewer, raw, request.headers.get("Idempotency-Key"));
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

export const m33Handlers = [
  http.post(`*${API_BASE}/online-tests/:id/attempts`, ({ request, params }) =>
    runWrite(request, (viewer, raw) => {
      const { learner, test } = learnerTest(viewer, params["id"]);
      return startAttempt(test, learner.id, raw);
    }),
  ),
  get("/attempts/:id/delivery", M, ({ viewer, params }) =>
    getDelivery(ownAttempt(viewer, params["id"])),
  ),
  http.put(`*${API_BASE}/attempts/:id/responses/:itemId`, ({ request, params }) =>
    runWrite(request, (viewer, raw, key) =>
      saveAnswer(ownAttempt(viewer, params["id"]), params["itemId"], raw, key),
    ),
  ),
  http.post(`*${API_BASE}/attempts/:id/submit`, ({ request, params }) =>
    runWrite(request, (viewer, raw) => submitAttempt(ownAttempt(viewer, params["id"]), raw)),
  ),
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
