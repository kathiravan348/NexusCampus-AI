import {
  ApiErrorSchema,
  ColumnMappingSchema,
  ImportJobSchema,
  ImportRowIssueSchema,
  PromotionDecisionSchema,
  RolloverRunSchema,
  pageSchema,
  type ImportJobInput,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { IMPORT_JOB, PERSON, ROLLOVER_RUN, TENANT, USER } from "../fixtures";
import { server } from "../node";

const job = `/import-jobs/${IMPORT_JOB.ls[1]}`;
const run = `/rollover-runs/${ROLLOVER_RUN.ls}`;

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

const sampleInput: ImportJobInput = {
  entity: "learner",
  fileName: "learners.csv",
  sourceFormat: "csv",
};

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M09 and M86 read handlers", () => {
  it.each([
    ["/import-jobs", pageSchema(ImportJobSchema), 2],
    [`${job}/mappings`, pageSchema(ColumnMappingSchema), 1],
    [`${job}/issues`, pageSchema(ImportRowIssueSchema), 2],
    ["/rollover-runs", pageSchema(RolloverRunSchema), 1],
    [`${run}/decisions`, pageSchema(PromotionDecisionSchema), 4],
  ] as const)("lets admins read tenant data at %s", async (path, schema, count) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    const { items, total } = schema.parse(await response.json());
    expect(total).toBe(count);
    expect(items).toHaveLength(count);
    for (const row of items) {
      if ("tenantId" in row) expect(row.tenantId).toBe(TENANT.littleSteps);
      if ("jobId" in row) expect(row.jobId).toBe(IMPORT_JOB.ls[1]);
      if ("runId" in row) expect(row.runId).toBe(ROLLOVER_RUN.ls);
    }
  });

  it.each([
    `/import-jobs/${IMPORT_JOB.rv[1]}/mappings`,
    `/import-jobs/${IMPORT_JOB.rv[1]}/issues`,
    `/rollover-runs/${ROLLOVER_RUN.rv}/decisions`,
  ])("returns 404 for a foreign parent at %s", async (path) => {
    expect((await get(path)).status).toBe(404);
  });

  it.each([
    "/import-jobs",
    `${job}/mappings`,
    `${job}/issues`,
    "/rollover-runs",
    `${run}/decisions`,
  ])("denies teachers at %s", async (path) => {
    expect((await get(path, USER.lsArjun)).status).toBe(403);
  });

  it("returns an empty issues page for a job without issues", async () => {
    const response = await get(`/import-jobs/${IMPORT_JOB.ls[0]}/issues`);
    expect(response.status).toBe(200);
    expect(pageSchema(ImportRowIssueSchema).parse(await response.json()).items).toEqual([]);
  });
});

describe("POST /import-jobs", () => {
  it("registers an uploaded import job for an admin with a staff profile", async () => {
    const response = await post("/import-jobs", sampleInput);
    expect(response.status).toBe(201);
    const created = ImportJobSchema.parse(await response.json());
    expect(created).toMatchObject({
      tenantId: TENANT.riverside,
      entity: "learner",
      fileName: "learners.csv",
      sourceFormat: "csv",
      templateVersion: 1,
      status: "uploaded",
      totalRows: 0,
      validRows: 0,
      errorRows: 0,
      createdByStaffProfileId: "rp-rv-helen-staff",
      rollbackUntil: null,
    });

    const listResponse = await get("/import-jobs", USER.rvHelen, TENANT.riverside);
    const page = pageSchema(ImportJobSchema).parse(await listResponse.json());
    expect(page.items.some((row) => row.id === created.id)).toBe(true);
  });

  it("forbids viewers without m09.import.manage", async () => {
    const response = await post("/import-jobs", sampleInput, USER.rvTom, TENANT.riverside);
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });

  it("forbids a viewer with read-only import permission", async () => {
    const teacherRole = mockDb.roles.find(
      (row) => row.tenantId === TENANT.riverside && row.id === "role-rv-teacher",
    )!;
    teacherRole.permissions.push("m09.import.read");

    const response = await post("/import-jobs", sampleInput, USER.rvTom, TENANT.riverside);
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });

  it("forbids a manager who has no active staff profile", async () => {
    mockDb.roleProfiles = mockDb.roleProfiles.filter(
      (row) => !(row.tenantId === TENANT.riverside && row.personId === PERSON.rvHelen),
    );
    const response = await post("/import-jobs", sampleInput);
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("forbidden");
  });

  it("returns 403 module_disabled when M09 is switched off", async () => {
    const entry = mockDb.entitlements.find(
      (row) => row.tenantId === TENANT.riverside && row.moduleId === "M09",
    )!;
    entry.enabled = false;
    const response = await post("/import-jobs", sampleInput);
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe("module_disabled");
  });

  it.each([
    ["path traversal in file name", { fileName: "../bad.csv" }, "fileName"],
    ["unsupported format", { sourceFormat: "txt" }, "sourceFormat"],
    ["unknown entity", { entity: "invoice" }, "entity"],
    ["extra file contents field", { fileContents: "raw" }, ""],
  ] as const)("returns 400 invalid_request for %s", async (_label, patch, expectedPath) => {
    const response = await post("/import-jobs", { ...sampleInput, ...patch });
    expect(response.status).toBe(400);
    const body = ApiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("invalid_request");
    if (expectedPath) expect(body.error.details?.[0]?.path).toBe(expectedPath);
  });
});

describe("M86 rollover writes (D84)", () => {
  function send(method: string, path: string, body?: unknown, user: string = USER.lsPriya) {
    return fetch(`http://localhost/api/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        [MOCK_HEADER.tenant]: TENANT.littleSteps,
        [MOCK_HEADER.user]: user,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function fixtureRun() {
    const page = pageSchema(RolloverRunSchema).parse(await (await get("/rollover-runs")).json());
    const current = page.items[0];
    if (!current) throw new Error("missing fixture run");
    return current;
  }

  async function errorOf(response: Response) {
    return ApiErrorSchema.parse(await response.json()).error;
  }

  it("refuses a second open run, then dry-runs once the first is confirmed", async () => {
    const current = await fixtureRun();
    // The demo names the next academic year without a calendar row yet (NEX-195 adds it).
    const year = mockDb.calendars.find((row) => row.id === current.fromAcademicYearId);
    if (!year) throw new Error("missing calendar");
    mockDb.calendars.push({ ...year, id: current.toAcademicYearId } as typeof year);
    const input = {
      institutionId: current.institutionId,
      fromAcademicYearId: current.fromAcademicYearId,
      toAcademicYearId: current.toAcademicYearId,
      carryForwardFees: false,
    };
    const blocked = await send("POST", "/rollover-runs", input);
    expect(blocked.status).toBe(409);
    expect((await errorOf(blocked)).details?.[0]?.path).toBe("fromAcademicYearId");

    const confirmed = await send("POST", `/rollover-runs/${current.id}/confirm`);
    expect(confirmed.status).toBe(200);
    const done = RolloverRunSchema.parse(await confirmed.json());
    expect(done.status).toBe("completed");
    expect(Date.parse(done.rollbackUntil ?? "")).toBeGreaterThan(Date.now() + 13 * 86_400_000);

    const created = await send("POST", "/rollover-runs", input);
    expect(created.status).toBe(201);
    const run = RolloverRunSchema.parse(await created.json());
    expect(run).toMatchObject({
      status: "dry_run_ready",
      createdByStaffProfileId: "rp-ls-priya-staff",
    });
    const decisions = pageSchema(PromotionDecisionSchema).parse(
      await (await get(`/rollover-runs/${run.id}/decisions`)).json(),
    );
    const total = Object.values(run.counts).reduce((sum, value) => sum + value, 0);
    expect(decisions.total).toBe(total);
    for (const decision of decisions.items) expect(decision.overriddenByStaffProfileId).toBeNull();
  });

  it("overrides a decision, recounts, confirms and rolls back inside the window", async () => {
    const current = await fixtureRun();
    const decisions = pageSchema(PromotionDecisionSchema).parse(
      await (await get(`/rollover-runs/${current.id}/decisions`)).json(),
    );
    const target = decisions.items.find((row) => row.action !== "skip");
    if (!target) throw new Error("missing decision");
    const path = `/rollover-runs/${current.id}/decisions/${target.id}`;
    const changed = await send("PUT", path, {
      action: "skip",
      toClassGroupId: null,
      reasonKey: null,
    });
    expect(changed.status).toBe(200);
    expect(PromotionDecisionSchema.parse(await changed.json())).toMatchObject({
      action: "skip",
      overriddenByStaffProfileId: "rp-ls-priya-staff",
    });
    expect((await fixtureRun()).counts.skip).toBe(current.counts.skip + 1);

    const foreign = await send("PUT", path, {
      action: "promote",
      toClassGroupId: "cg-unknown",
      reasonKey: null,
    });
    expect(foreign.status).toBe(400);
    expect((await errorOf(foreign)).details?.[0]?.path).toBe("toClassGroupId");
    const bad = await send("PUT", path, {
      action: "promote",
      toClassGroupId: null,
      reasonKey: null,
    });
    expect(bad.status).toBe(400);

    expect((await send("POST", `/rollover-runs/${current.id}/confirm`)).status).toBe(200);
    const late = await send("PUT", path, { action: "skip", toClassGroupId: null, reasonKey: null });
    expect(late.status).toBe(409);
    expect((await errorOf(late)).details?.[0]?.path).toBe("status");

    const undone = await send("POST", `/rollover-runs/${current.id}/rollback`);
    expect(undone.status).toBe(200);
    expect(RolloverRunSchema.parse(await undone.json())).toMatchObject({
      status: "rolled_back",
      rollbackUntil: null,
    });
    const again = await send("POST", `/rollover-runs/${current.id}/rollback`);
    expect(again.status).toBe(409);
    expect((await errorOf(again)).details?.[0]?.path).toBe("rollbackUntil");
  });

  it("checks permission before the body and answers 404 for unknown runs", async () => {
    const current = await fixtureRun();
    expect((await send("POST", "/rollover-runs", undefined, USER.lsArjun)).status).toBe(403);
    expect(
      (await send("POST", `/rollover-runs/${current.id}/confirm`, undefined, USER.lsArjun)).status,
    ).toBe(403);
    const invalid = await send("POST", "/rollover-runs", { institutionId: current.institutionId });
    expect(invalid.status).toBe(400);
    expect((await send("POST", "/rollover-runs/roll-unknown/confirm")).status).toBe(404);
    expect(
      (await send("PUT", `/rollover-runs/${current.id}/decisions/pd-unknown`, {})).status,
    ).toBe(404);
  });
});
