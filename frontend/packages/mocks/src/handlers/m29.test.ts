import {
  CoverageEntrySchema,
  LessonPlanSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  SyllabusCoverageSchema,
  SyllabusUnitSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb, resetMockDb } from "../db";
import { LEARNER, TENANT, USER } from "../fixtures";
import { server } from "../node";
import type { Parser } from "./route";

function get(path: string, tenantId: string, userId: string) {
  return fetch("http://localhost/api/v1" + path, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
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
