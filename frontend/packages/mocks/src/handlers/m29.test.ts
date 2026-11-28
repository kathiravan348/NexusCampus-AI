import {
  CoverageEntrySchema,
  LessonPlanSchema,
  LessonPlanInputSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  SyllabusCoverageSchema,
  SyllabusUnitSchema,
  pageSchema,
  type LessonPlanInput,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb as db, resetMockDb } from "../db";
import * as fixtures from "../fixtures";
import { server } from "../node";
import type { Parser } from "./route";

const { LEARNER, LESSON_PLAN, OUTCOME, PERSON, SYLLABUS_TOPIC, TENANT, USER } = fixtures;
const decision = { decision: "approve", note: null };
const planPath = "/lesson-plans";
const riverside = TENANT.riverside;
const get = (path: string, tenant: string, user: string) => send("GET", path, tenant, user);

function send(
  method: "POST" | "PUT" | "GET",
  path: string,
  tenantId: string,
  userId: string,
  body?: unknown,
  idempotencyKey?: string,
) {
  return fetch("http://localhost/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: tenantId,
      [MOCK_HEADER.user]: userId,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function staffIdFor(personId: string): string {
  return db.roleProfiles.find((row) => row.personId === personId && row.kind === "staff")!.id;
}

function draftInput(overrides: Partial<LessonPlanInput> = {}): LessonPlanInput {
  const returned = db.lessonPlans.find((p) => p.id === LESSON_PLAN.rvReturned)!;
  return LessonPlanInputSchema.strip().parse({
    ...returned,
    timetableSlotId: null,
    topicIds: [SYLLABUS_TOPIC.rvEng3],
    ...overrides,
  });
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  expect(response.status).toBe(200);
  return schema.parse(await response.json());
}

async function readCoverage(id: string, tenant: string, user: string) {
  const res = await get("/syllabus-coverage?subjectOfferingId=" + id, tenant, user);
  expect(res.status).toBe(200);
  const { coverage, entries } = await res.json();
  return {
    coverage: SyllabusCoverageSchema.parse(coverage),
    entries: CoverageEntrySchema.array().parse(entries),
  };
}

function adminPage(tenant: string) {
  const user = db.users.find(
    (u) => u.tenantId === tenant && permissionsOf(u.id).has("m29.lessonplan.review"),
  )!;
  return async <T>(path: string, schema: Parser<T>) =>
    parse(await get(path, tenant, user.id), schema);
}

const status = async (request: Promise<Response>, code: number) =>
  expect((await request).status).toBe(code);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

it("pages tenant frameworks, outcomes and both sides of outcome mappings", async () => {
  const tenant = TENANT.northbridge;
  const page = adminPage(tenant);
  const frameworks = await page("/outcome-frameworks", pageSchema(OutcomeFrameworkSchema));
  expect(frameworks.items).toHaveLength(2);
  for (const framework of frameworks.items) {
    expect(framework.tenantId).toBe(tenant);
    const outcomes = await page("/outcomes?frameworkId=" + framework.id, pageSchema(OutcomeSchema));
    expect(outcomes.total).toBe(3);
    expect(outcomes.items.every((row) => row.frameworkId === framework.id)).toBe(true);

    const mappings = await page(
      "/outcome-mappings?frameworkId=" + framework.id + "&page=2&pageSize=2",
      pageSchema(OutcomeMappingSchema),
    );
    expect(mappings).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(mappings.items).toHaveLength(2);
  }
});

it("lists the syllabus and lesson plans and computes coverage for the offering's year level", async () => {
  const tenant = riverside;
  const page = adminPage(tenant);
  const { subjectOfferingId } = db.coverageEntries[0]!;
  const offering = db.subjectOfferings.find((row) => row.id === subjectOfferingId)!;
  const units = await page(
    "/syllabus-units?subjectId=" + offering.subjectId,
    pageSchema(SyllabusUnitSchema),
  );
  expect(units.total).toBe(2);
  const plans = await page(
    "/lesson-plans?subjectOfferingId=" + subjectOfferingId,
    pageSchema(LessonPlanSchema),
  );
  expect(plans.items).toHaveLength(2);
  expect(plans.items.every((row) => row.subjectOfferingId === subjectOfferingId)).toBe(true);

  const { coverage, entries } = await readCoverage(subjectOfferingId, tenant, USER.rvHelen);
  expect(coverage).toEqual({
    subjectOfferingId,
    topicsTotal: 2,
    topicsCovered: 1,
    percentBps: 5000,
  });
  expect(entries).toEqual(
    db.coverageEntries.filter((row) => row.subjectOfferingId === subjectOfferingId),
  );
});

it("returns zero coverage for a local offering with no syllabus topics", async () => {
  const tenant = TENANT.littleSteps;
  const offering = db.subjectOfferings.find((row) => row.tenantId === tenant)!;
  expect(await readCoverage(offering.id, tenant, USER.lsPriya)).toEqual({
    coverage: { subjectOfferingId: offering.id, topicsTotal: 0, topicsCovered: 0, percentBps: 0 },
    entries: [],
  });
});

it("returns 404 for every kind of foreign filter id", async () => {
  const foreign = db.subjectOfferings.find((row) => row.tenantId === riverside)!;
  const framework = db.outcomeFrameworks.find((row) => row.tenantId === riverside)!;
  for (const path of [
    "/outcomes?frameworkId=" + framework.id,
    "/outcome-mappings?frameworkId=" + framework.id,
    "/syllabus-units?subjectId=" + foreign.subjectId,
    "/lesson-plans?subjectOfferingId=" + foreign.id,
    "/syllabus-coverage?subjectOfferingId=" + foreign.id,
  ]) {
    await status(get(path, TENANT.littleSteps, USER.lsPriya), 404);
  }
});

it("requires entitlement, curriculum read and separate lesson-plan permission", async () => {
  const tenant = TENANT.littleSteps;
  const learner = db.learners.find((row) => row.id === LEARNER.nbJordan)!;
  const user = db.users.find(
    (row) => row.tenantId === learner.tenantId && row.personId === learner.personId,
  )!;
  await status(get(planPath, learner.tenantId, user.id), 403);
  await status(get("/outcome-frameworks", learner.tenantId, user.id), 403);

  for (const role of db.roles) {
    role.permissions = role.permissions.filter(
      (code) => code !== "m29.lessonplan.write" && code !== "m29.lessonplan.review",
    );
  }
  await status(get(planPath, tenant, USER.lsPriya), 403);
  await status(get("/outcome-frameworks", tenant, USER.lsPriya), 200);

  db.entitlements = db.entitlements.filter(
    (row) => row.tenantId !== tenant || row.moduleId !== "M29",
  );
  const response = await get("/outcome-frameworks", tenant, USER.lsPriya);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "module_disabled" } });
});

it("creates drafts with idempotency and rejects foreign or wrong-subject refs", async () => {
  const post = (body: unknown, key?: string) =>
    send("POST", planPath, riverside, USER.rvTom, body, key);
  const first = await post(draftInput(), "m29-create-1");
  expect(first.status).toBe(201);
  const created = LessonPlanSchema.parse(await first.json());
  expect(created).toMatchObject({
    tenantId: riverside,
    status: "draft",
    reviewedByStaffProfileId: null,
    reviewNote: null,
  });

  const replay = await post(draftInput(), "m29-create-1");
  expect(replay.status).toBe(201);
  expect(LessonPlanSchema.parse(await replay.json()).id).toBe(created.id);

  const foreignOffering = db.subjectOfferings.find((row) => row.tenantId === TENANT.northbridge)!;
  await status(post(draftInput({ subjectOfferingId: foreignOffering.id })), 400);
  await status(post(draftInput({ topicIds: [SYLLABUS_TOPIC.rvMath1] })), 400);
  await status(post(draftInput({ outcomeIds: [OUTCOME.nbCo1] })), 400);

  const foreignInput = draftInput({
    subjectOfferingId: foreignOffering.id,
    staffProfileId: staffIdFor(PERSON.nbElena),
    outcomeIds: [OUTCOME.nbCo1],
  });
  await status(send("POST", planPath, TENANT.northbridge, USER.nbElena, foreignInput), 400);
});

it("updates only the author's editable plans and rejects spoofed authors", async () => {
  const edit = (id: string, userId: string, input: LessonPlanInput) =>
    send("PUT", "/lesson-plans/" + id, riverside, userId, input);
  const input = draftInput({ title: "Revised plan" });
  const response = await edit(LESSON_PLAN.rvReturned, USER.rvTom, input);
  const updated = await parse(response, LessonPlanSchema);
  expect(updated).toMatchObject({
    id: LESSON_PLAN.rvReturned,
    title: input.title,
    status: "returned",
    reviewNote: "Add a brief formative check.",
  });
  const other = draftInput({ staffProfileId: staffIdFor(PERSON.rvAmira) });
  const conflict = await edit(LESSON_PLAN.rvSubmitted, USER.rvAmira, other);
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ error: { code: "conflict" } });
  await status(edit(LESSON_PLAN.rvReturned, USER.rvAmira, other), 403);
  await status(send("POST", planPath, riverside, USER.rvTom, other), 403);
});

it("submits, returns, edits, approves and delivers with replay-safe offering coverage", async () => {
  const tom = USER.rvTom;
  const reviewer = USER.rvHelen;
  const input = draftInput({ topicIds: [SYLLABUS_TOPIC.rvEng3, SYLLABUS_TOPIC.rvEng4] });
  const created = await send("POST", planPath, riverside, tom, input);
  const plan = LessonPlanSchema.parse(await created.json());
  const path = "/lesson-plans/" + plan.id;
  const action = (user: string, name: string, body: unknown, key?: string) =>
    send("POST", path + "/" + name, riverside, user, body, key);

  const delivery = { deliveredOn: "2026-01-01" };
  await status(action(reviewer, "review", decision), 409);
  await status(action(reviewer, "submit", {}), 403);
  await status(send("POST", path + "/submit", TENANT.northbridge, USER.nbElena, {}), 404);
  const first = await parse(await action(tom, "submit", {}, "first"), LessonPlanSchema);
  expect(first.status).toBe("submitted");
  await status(action(tom, "delivered", delivery), 409);
  await status(action(USER.rvAmira, "review", decision), 403);
  const revision = { decision: "return", note: "Add practice." };
  const returned = await parse(await action(reviewer, "review", revision), LessonPlanSchema);
  expect(returned).toMatchObject({
    status: "returned",
    reviewNote: "Add practice.",
    reviewedByStaffProfileId: staffIdFor(PERSON.rvHelen),
  });
  expect(await parse(await action(tom, "submit", {}, "first"), LessonPlanSchema)).toEqual(first);
  await status(send("PUT", path, riverside, tom, { ...input, title: "Revised workshop" }), 200);
  expect(await parse(await action(tom, "submit", {}), LessonPlanSchema)).toMatchObject({
    status: "submitted",
    reviewedAt: null,
    reviewedByStaffProfileId: null,
    reviewNote: null,
  });
  await status(action(reviewer, "review", decision), 200);
  await status(action(tom, "delivered", { deliveredOn: "9999-01-01" }), 400);
  const coverage = () => readCoverage(input.subjectOfferingId, riverside, tom);
  db.coverageEntries = db.coverageEntries.filter(
    (row) =>
      row.subjectOfferingId !== input.subjectOfferingId || row.topicId !== SYLLABUS_TOPIC.rvEng3,
  );
  const before = await coverage();
  await status(action(tom, "delivered", delivery, "teach"), 200);
  const after = await coverage();
  expect(after.coverage.percentBps).toBeGreaterThan(before.coverage.percentBps);
  expect(after.coverage.percentBps).toBe(10000);
  expect(after.entries).toHaveLength(2);
  const covered = { status: "covered", coveredOn: delivery.deliveredOn, lessonPlanId: plan.id };
  for (const entry of after.entries) expect(entry).toMatchObject(covered);
  await status(action(tom, "delivered", delivery, "teach"), 200);
  expect(await coverage()).toEqual(after);
});

it("forbids a reviewer from reviewing their own submission", async () => {
  const plan = db.lessonPlans.find((row) => row.id === LESSON_PLAN.rvSubmitted)!;
  const staffProfileId = staffIdFor(PERSON.rvHelen);
  db.lessonPlans[db.lessonPlans.indexOf(plan)] = { ...plan, staffProfileId };
  const path = planPath + "/" + plan.id + "/review";
  await status(send("POST", path, riverside, USER.rvHelen, decision), 403);
});
