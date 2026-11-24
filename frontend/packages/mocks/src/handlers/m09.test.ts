import {
  ColumnMappingSchema,
  ImportJobSchema,
  ImportRowIssueSchema,
  PromotionDecisionSchema,
  RolloverRunSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { IMPORT_JOB, ROLLOVER_RUN, TENANT, USER } from "../fixtures";
import { server } from "../node";

const job = `/import-jobs/${IMPORT_JOB.ls[1]}`;
const run = `/rollover-runs/${ROLLOVER_RUN.ls}`;

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
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
