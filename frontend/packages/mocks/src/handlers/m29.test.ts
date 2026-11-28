import {
  CoverageEntrySchema,
  LessonPlanSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  SyllabusCoverageSchema,
  SyllabusUnitSchema,
  pageSchema,
  type LessonPlanInput,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb, resetMockDb } from "../db";
import {
  LEARNER,
  LESSON_PLAN,
  OFFERING,
  OUTCOME,
  PERSON,
  SYLLABUS_TOPIC,
  TENANT,
  USER,
} from "../fixtures";
import { server } from "../node";
import type { Parser } from "./route";

function get(path: string, tenantId: string, userId: string) {
  return fetch("http://localhost/api/v1" + path, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function send(
  method: "POST" | "PUT",
  path: string,
  tenantId: string,
  userId: string,
  body: unknown,
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
    body: JSON.stringify(body),
  });
}

function staffIdFor(personId: string): string {
  return mockDb.roleProfiles.find((row) => row.personId === personId && row.kind === "staff")!.id;
}

function draftInput(overrides: Partial<LessonPlanInput> = {}): LessonPlanInput {
  return {
    subjectOfferingId: OFFERING.rvNorthYearNine[0],
    staffProfileId: staffIdFor(PERSON.rvTom),
    date: "2026-10-05",
    timetableSlotId: null,
    title: "Thesis Workshop",
    topicIds: [SYLLABUS_TOPIC.rvEng3],
    outcomeIds: [OUTCOME.rvEngWrite],
    objectives: "Draft clear thesis statements.",
    activities: [{ order: 1, title: "Model examples", minutes: 15, kind: "instruction" }],
    resources: "Worksheet pack",
    source: "manual",
    ...overrides,
  };
}

function admin(tenantId: string) {
  return mockDb.users.find(
    (row) => row.tenantId === tenantId && permissionsOf(row.id).has("m29.lessonplan.review"),
  )!.id;
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

describe("M29 read handlers", () => {
  it("pages tenant frameworks, outcomes and both sides of outcome mappings", async () => {
    const tenant = TENANT.northbridge;
    const request = (path: string) => get(path, tenant, admin(tenant));
    const frameworks = await parse(
      await request("/outcome-frameworks"),
      pageSchema(OutcomeFrameworkSchema),
    );
    expect(frameworks.items).toHaveLength(2);
    for (const framework of frameworks.items) {
      expect(framework.tenantId).toBe(tenant);
      const outcomes = await parse(
        await request("/outcomes?frameworkId=" + framework.id),
        pageSchema(OutcomeSchema),
      );
      expect(outcomes.total).toBe(3);
      expect(outcomes.items.every((row) => row.frameworkId === framework.id)).toBe(true);

      const mappings = await parse(
        await request("/outcome-mappings?frameworkId=" + framework.id + "&page=2&pageSize=2"),
        pageSchema(OutcomeMappingSchema),
      );
      expect(mappings).toMatchObject({ total: 5, page: 2, pageSize: 2 });
      expect(mappings.items).toHaveLength(2);
    }
  });

  it("lists the syllabus and lesson plans and computes coverage for the offering's year level", async () => {
    const tenant = TENANT.riverside;
    const request = (path: string) => get(path, tenant, admin(tenant));
    const { subjectOfferingId } = mockDb.coverageEntries[0]!;
    const offering = mockDb.subjectOfferings.find((row) => row.id === subjectOfferingId)!;
    const units = await parse(
      await request("/syllabus-units?subjectId=" + offering.subjectId),
      pageSchema(SyllabusUnitSchema),
    );
    expect(units.total).toBe(2);
    const plans = await parse(
      await request("/lesson-plans?subjectOfferingId=" + subjectOfferingId),
      pageSchema(LessonPlanSchema),
    );
    expect(plans.items).toHaveLength(2);
    expect(plans.items.every((row) => row.subjectOfferingId === subjectOfferingId)).toBe(true);

    const response = await request("/syllabus-coverage?subjectOfferingId=" + subjectOfferingId);
    expect(response.status).toBe(200);
    const { coverage, entries } = await response.json();
    expect(SyllabusCoverageSchema.parse(coverage)).toEqual({
      subjectOfferingId,
      topicsTotal: 2,
      topicsCovered: 1,
      percentBps: 5000,
    });
    expect(CoverageEntrySchema.array().parse(entries)).toEqual(
      mockDb.coverageEntries.filter((row) => row.subjectOfferingId === subjectOfferingId),
    );
  });

  it("returns zero coverage for a local offering with no syllabus topics", async () => {
    const tenant = TENANT.littleSteps;
    const offering = mockDb.subjectOfferings.find((row) => row.tenantId === tenant)!;
    const response = await get(
      "/syllabus-coverage?subjectOfferingId=" + offering.id,
      tenant,
      USER.lsPriya,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      coverage: { subjectOfferingId: offering.id, topicsTotal: 0, topicsCovered: 0, percentBps: 0 },
      entries: [],
    });
  });

  it("returns 404 for every kind of foreign filter id", async () => {
    const foreign = mockDb.subjectOfferings.find((row) => row.tenantId === TENANT.riverside)!;
    const framework = mockDb.outcomeFrameworks.find((row) => row.tenantId === TENANT.riverside)!;
    for (const path of [
      "/outcomes?frameworkId=" + framework.id,
      "/outcome-mappings?frameworkId=" + framework.id,
      "/syllabus-units?subjectId=" + foreign.subjectId,
      "/lesson-plans?subjectOfferingId=" + foreign.id,
      "/syllabus-coverage?subjectOfferingId=" + foreign.id,
    ]) {
      expect((await get(path, TENANT.littleSteps, USER.lsPriya)).status).toBe(404);
    }
  });

  it("requires entitlement, curriculum read and separate lesson-plan permission", async () => {
    const tenant = TENANT.littleSteps;
    const learner = mockDb.learners.find((row) => row.id === LEARNER.nbJordan)!;
    const user = mockDb.users.find(
      (row) => row.tenantId === learner.tenantId && row.personId === learner.personId,
    )!;
    expect((await get("/lesson-plans", learner.tenantId, user.id)).status).toBe(403);
    expect((await get("/outcome-frameworks", learner.tenantId, user.id)).status).toBe(403);

    for (const role of mockDb.roles) {
      role.permissions = role.permissions.filter(
        (code) => code !== "m29.lessonplan.write" && code !== "m29.lessonplan.review",
      );
    }
    expect((await get("/lesson-plans", tenant, USER.lsPriya)).status).toBe(403);
    expect((await get("/outcome-frameworks", tenant, USER.lsPriya)).status).toBe(200);

    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M29",
    );
    const response = await get("/outcome-frameworks", tenant, USER.lsPriya);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});

describe("M29 write handlers", () => {
  it("creates drafts with idempotency and rejects foreign or wrong-subject refs", async () => {
    const post = (body: unknown, key?: string) =>
      send("POST", "/lesson-plans", TENANT.riverside, USER.rvTom, body, key);
    const first = await post(draftInput(), "m29-create-1");
    expect(first.status).toBe(201);
    const created = LessonPlanSchema.parse(await first.json());
    expect(created).toMatchObject({
      tenantId: TENANT.riverside,
      status: "draft",
      reviewedByStaffProfileId: null,
      reviewNote: null,
    });

    const replay = await post(draftInput(), "m29-create-1");
    expect(replay.status).toBe(201);
    expect(LessonPlanSchema.parse(await replay.json()).id).toBe(created.id);

    const foreignOffering = mockDb.subjectOfferings.find(
      (row) => row.tenantId === TENANT.northbridge,
    )!;
    expect((await post(draftInput({ subjectOfferingId: foreignOffering.id }))).status).toBe(400);
    expect((await post(draftInput({ topicIds: [SYLLABUS_TOPIC.rvMath1] }))).status).toBe(400);
    expect((await post(draftInput({ outcomeIds: [OUTCOME.nbCo1] }))).status).toBe(400);

    const foreignTopic = await send(
      "POST",
      "/lesson-plans",
      TENANT.northbridge,
      USER.nbElena,
      draftInput({
        subjectOfferingId: foreignOffering.id,
        staffProfileId: staffIdFor(PERSON.nbElena),
        topicIds: [SYLLABUS_TOPIC.rvEng3],
        outcomeIds: [OUTCOME.nbCo1],
      }),
    );
    expect(foreignTopic.status).toBe(400);
  });

  it("updates own returned plans and blocks submitted (409) or others' plans (403)", async () => {
    const updated = await send(
      "PUT",
      `/lesson-plans/${LESSON_PLAN.rvReturned}`,
      TENANT.riverside,
      USER.rvTom,
      draftInput({ title: "Updated Evidence Paragraphs", topicIds: [SYLLABUS_TOPIC.rvEng4] }),
      "m29-put-1",
    );
    expect(updated.status).toBe(200);
    expect(LessonPlanSchema.parse(await updated.json())).toMatchObject({
      id: LESSON_PLAN.rvReturned,
      title: "Updated Evidence Paragraphs",
      status: "returned",
      reviewNote: "Add a brief formative check.",
    });

    const submitted = await send(
      "PUT",
      `/lesson-plans/${LESSON_PLAN.rvSubmitted}`,
      TENANT.riverside,
      USER.rvAmira,
      draftInput({
        subjectOfferingId: OFFERING.rvSouthYearFive[0],
        staffProfileId: staffIdFor(PERSON.rvAmira),
        topicIds: [SYLLABUS_TOPIC.rvEng1],
        outcomeIds: [OUTCOME.rvEngRead],
      }),
    );
    expect(submitted.status).toBe(409);
    expect(await submitted.json()).toMatchObject({ error: { code: "conflict" } });

    const otherTeacher = await send(
      "PUT",
      `/lesson-plans/${LESSON_PLAN.rvReturned}`,
      TENANT.riverside,
      USER.rvAmira,
      draftInput({ staffProfileId: staffIdFor(PERSON.rvAmira) }),
    );
    expect(otherTeacher.status).toBe(403);

    const spoofed = await send(
      "POST",
      "/lesson-plans",
      TENANT.riverside,
      USER.rvTom,
      draftInput({ staffProfileId: staffIdFor(PERSON.rvAmira) }),
    );
    expect(spoofed.status).toBe(403);
  });
});
