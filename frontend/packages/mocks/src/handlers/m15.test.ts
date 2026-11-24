import {
  ClassGroupSchema,
  ProgramSchema,
  SubjectOfferingSchema,
  SubjectSchema,
  YearLevelSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CALENDAR, TENANT, USER } from "../fixtures";
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

describe("M15 read handlers", () => {
  it.each([
    ["/programs", pageSchema(ProgramSchema)],
    ["/year-levels", pageSchema(YearLevelSchema)],
    ["/class-groups", pageSchema(ClassGroupSchema)],
    ["/subjects", pageSchema(SubjectSchema)],
    ["/subject-offerings", pageSchema(SubjectOfferingSchema)],
  ] as const)("lists only the admin's tenant at %s", async (path, schema) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    const { items } = schema.parse(await response.json());
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.tenantId === TENANT.littleSteps)).toBe(true);
  });

  it("paginates teacher reads by academic year and rejects another tenant's year", async () => {
    const path = `/subject-offerings?academicYearId=${CALENDAR.littleSteps}&page=2&pageSize=1`;
    const response = await get(path, USER.lsArjun);
    expect(response.status).toBe(200);
    const page = pageSchema(SubjectOfferingSchema).parse(await response.json());
    expect(page).toMatchObject({ page: 2, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.academicYearId).toBe(CALENDAR.littleSteps);
    expect(page.total).toBeGreaterThan(1);
    expect(
      (await get(`/subject-offerings?academicYearId=${CALENDAR.riversideSchool}`)).status,
    ).toBe(404);
  });

  it("requires structure read permission", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/programs")).status).toBe(403);
  });
});
