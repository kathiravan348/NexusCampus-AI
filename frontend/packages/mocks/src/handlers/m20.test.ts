import {
  AssessmentSchema,
  GradingSchemeSchema,
  MarkEntrySchema,
  RubricSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { ASSESSMENT, CLASS_GROUP, LEARNER, TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

const marksPath = (id: string) => `/assessments/${id}/marks`;

describe("M20 read handlers", () => {
  it("lists tenant-local records for admins", async () => {
    const endpoints = [
      ["/grading-schemes", pageSchema(GradingSchemeSchema)],
      ["/assessments", pageSchema(AssessmentSchema)],
      ["/rubrics", pageSchema(RubricSchema)],
      [marksPath(ASSESSMENT.ls[0]), pageSchema(MarkEntrySchema)],
    ] as const;
    for (const [path, schema] of endpoints) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const { items } = schema.parse(await response.json());
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    }
  });

  it("filters assessments by the offering's class group", async () => {
    const response = await get(`/assessments?classGroupId=${CLASS_GROUP.lsSeedlings}`);
    expect(response.status).toBe(200);
    expect(
      pageSchema(AssessmentSchema)
        .parse(await response.json())
        .items.map((row) => row.id),
    ).toEqual([ASSESSMENT.ls[0]]);
    expect((await get(`/assessments?classGroupId=${CLASS_GROUP.rvSouthYearFive}`)).status).toBe(
      404,
    );
  });

  it("lets teachers read marks and returns 404 for foreign assessments", async () => {
    const response = await get(marksPath(ASSESSMENT.ls[0]), USER.lsArjun);
    expect(response.status).toBe(200);
    expect(pageSchema(MarkEntrySchema).parse(await response.json()).items.length).toBeGreaterThan(
      0,
    );
    expect((await get(marksPath(ASSESSMENT.rv[0]))).status).toBe(404);
  });

  it("returns only a guardian's published family marks and removes remarks", async () => {
    const entry = mockDb.markEntries.find((row) => row.assessmentId === ASSESSMENT.ls[0])!;
    entry.learnerId = LEARNER.lsRohan;
    entry.remark = "Private example remark";
    mockDb.markEntries.push({ ...entry, learnerId: LEARNER.lsKavya });

    const response = await get(marksPath(ASSESSMENT.ls[0]), USER.lsSunita);
    expect(response.status).toBe(200);
    const { items } = pageSchema(MarkEntrySchema).parse(await response.json());
    expect(items).toEqual(expect.arrayContaining([{ ...entry, remark: null }]));
    expect(items.every((row) => row.remark === null)).toBe(true);
    expect(items.map((row) => row.learnerId)).not.toContain(LEARNER.lsKavya);
    expect((await get(marksPath(ASSESSMENT.ls[1]), USER.lsSunita)).status).toBe(404);
    expect((await get("/assessments", USER.lsSunita)).status).toBe(403);
  });

  it("denies an account without the read permission or family access", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/grading-schemes")).status).toBe(403);
  });
});
