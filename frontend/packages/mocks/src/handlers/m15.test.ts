import {
  ApiErrorSchema,
  ClassGroupSchema,
  ProgramSchema,
  SubjectOfferingSchema,
  SubjectSchema,
  YearLevelSchema,
  pageSchema,
  type ClassGroupInput,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CALENDAR, CAMPUS, INSTITUTION, PROGRAM, TENANT, USER, YEAR_LEVEL } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya, tenant: string = TENANT.littleSteps) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenant, [MOCK_HEADER.user]: user },
  });
}

function post(
  path: string,
  body: unknown,
  user: string = USER.rvHelen,
  tenant: string = TENANT.riverside,
) {
  return fetch(`http://localhost/api/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [MOCK_HEADER.tenant]: tenant,
      [MOCK_HEADER.user]: user,
    },
    body: JSON.stringify(body),
  });
}

const riversideInput: ClassGroupInput = {
  campusId: CAMPUS.riversideSouth,
  academicYearId: CALENDAR.riversideSchool,
  programId: PROGRAM.riverside,
  yearLevelId: YEAR_LEVEL.rvYearFive,
  kind: "section",
  code: "Y5-B",
  name: "Year 5 South B",
  capacity: 30,
  homeroomStaffProfileId: null,
};

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

describe("POST /class-groups", () => {
  it("creates a class group for a manager and appends it to mockDb", async () => {
    const response = await post("/class-groups", riversideInput);
    expect(response.status).toBe(201);
    const created = ClassGroupSchema.parse(await response.json());
    expect(created).toMatchObject({
      tenantId: TENANT.riverside,
      institutionId: INSTITUTION.riversideSchool,
      programId: PROGRAM.riverside,
      yearLevelId: YEAR_LEVEL.rvYearFive,
      code: "Y5-B",
      name: "Year 5 South B",
      capacity: 30,
    });

    const listResponse = await get("/class-groups", USER.rvHelen, TENANT.riverside);
    const page = pageSchema(ClassGroupSchema).parse(await listResponse.json());
    expect(page.items.some((row) => row.id === created.id)).toBe(true);
  });

  it("creates a batch without a year level", async () => {
    const response = await post("/class-groups", {
      ...riversideInput,
      kind: "batch",
      yearLevelId: null,
      campusId: null,
      capacity: null,
      code: "BATCH-1",
      name: "Foundation Bridge Batch",
    });
    expect(response.status).toBe(201);
    const created = ClassGroupSchema.parse(await response.json());
    expect(created.yearLevelId).toBeNull();
    expect(created.kind).toBe("batch");
  });

  it("forbids teachers without m15.structure.manage", async () => {
    const response = await post("/class-groups", riversideInput, USER.rvTom, TENANT.riverside);
    expect(response.status).toBe(403);
    const body = ApiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 409 conflict for a duplicate code in the same academic year", async () => {
    const response = await post("/class-groups", { ...riversideInput, code: "Y5" });
    expect(response.status).toBe(409);
    const body = ApiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("conflict");
    expect(body.error.details?.[0]?.path).toBe("code");
  });

  it.each([
    ["another tenant's program", { programId: PROGRAM.littleSteps }, "programId"],
    ["another tenant's calendar", { academicYearId: CALENDAR.littleSteps }, "academicYearId"],
    ["another tenant's year level", { yearLevelId: YEAR_LEVEL.lsSeedlings }, "yearLevelId"],
    ["another tenant's campus", { campusId: CAMPUS.littleSteps }, "campusId"],
  ])("returns 400 invalid_request for %s", async (_label, patch, expectedPath) => {
    const response = await post("/class-groups", { ...riversideInput, ...patch });
    expect(response.status).toBe(400);
    const body = ApiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.details?.[0]?.path).toBe(expectedPath);
  });

  it("rejects a year level belonging to another program of the same tenant", async () => {
    const firstProgram = mockDb.programs.find((p) => p.id === PROGRAM.riverside)!;
    mockDb.programs.push({
      ...firstProgram,
      id: "prg-rv-sixth",
      code: "SIXTH",
      name: "Sixth Form",
    });
    const response = await post("/class-groups", {
      ...riversideInput,
      programId: "prg-rv-sixth",
      yearLevelId: YEAR_LEVEL.rvYearFive,
    });
    expect(response.status).toBe(400);
    const body = ApiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.details?.[0]?.path).toBe("yearLevelId");
  });
});
