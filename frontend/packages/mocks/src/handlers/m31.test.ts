import {
  ContentAssetSchema,
  ContentAttemptSchema,
  ContentItemSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb, resetMockDb } from "../db";
import { LEARNER, TENANT, USER } from "../fixtures";
import { roleId } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

function get(path: string, tenantId: string, userId: string) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function admin(tenantId: string) {
  return mockDb.users.find(
    (row) => row.tenantId === tenantId && permissionsOf(row.id).has("m31.content.manage"),
  )!.id;
}

function signInLearner(tenantId: string, userId: string, personId: string) {
  mockDb.users = mockDb.users.map((row) =>
    row.tenantId === tenantId && row.id === userId ? { ...row, personId } : row,
  );
  const assignment = mockDb.roleAssignments.find(
    (row) => row.tenantId === tenantId && row.userId === userId,
  )!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== userId);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenantId, "learner") });
  return userId;
}

function learnerUser(learnerId: string) {
  const learner = mockDb.learners.find((row) => row.id === learnerId)!;
  return mockDb.users.find(
    (row) => row.tenantId === learner.tenantId && row.personId === learner.personId,
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

describe("M31 read handlers", () => {
  it("lets managers list content and asset metadata and read draft details", async () => {
    const tenant = TENANT.riverside;
    const request = (path: string) => get(path, tenant, admin(tenant));
    const items = await parse(await request("/content-items"), pageSchema(ContentItemSchema));
    expect(items.items).toEqual(mockDb.contentItems.filter((row) => row.tenantId === tenant));
    const draft = items.items.find((row) => row.status === "draft")!;
    expect(await parse(await request(`/content-items/${draft.id}`), ContentItemSchema)).toEqual(
      draft,
    );
    const assets = await parse(await request("/content-assets"), pageSchema(ContentAssetSchema));
    expect(assets.items).toEqual(mockDb.contentAssets.filter((row) => row.tenantId === tenant));
  });

  it("lists only published content and its referenced assets for a learner", async () => {
    const tenant = TENANT.riverside;
    const learner = mockDb.learners.find((row) => row.id === LEARNER.rvMia)!;
    const user = signInLearner(tenant, admin(tenant), learner.personId);
    const request = (path: string) => get(path, tenant, user);
    const draft = mockDb.contentItems.find(
      (row) => row.tenantId === tenant && row.status === "draft",
    )!;
    const draftAsset = draft.blocks?.find((row) => row.type === "image")?.assetId;
    expect(draftAsset).toBeDefined();

    const items = await parse(await request("/content-items"), pageSchema(ContentItemSchema));
    expect(items.total).toBe(2);
    expect(items.items.every((row) => row.status === "published")).toBe(true);
    expect((await request(`/content-items/${draft.id}`)).status).toBe(404);
    expect((await request(`/content-attempts?contentItemId=${draft.id}`)).status).toBe(404);

    const assets = await parse(await request("/content-assets"), pageSchema(ContentAssetSchema));
    expect(assets.total).toBe(5);
    expect(assets.items.map((row) => row.id)).not.toContain(draftAsset);
    expect(assets.items.map((row) => row.kind)).toContain("captions");
  });

  it("returns every attempt to managers and only the learner's attempts to learners", async () => {
    const tenant = TENANT.northbridge;
    const learnerId = LEARNER.nbJordan;
    const item = mockDb.contentItems.find((row) => row.tenantId === tenant)!;
    const path = `/content-attempts?contentItemId=${item.id}`;
    const schema = pageSchema(ContentAttemptSchema);
    const all = await parse(await get(path, tenant, admin(tenant)), schema);
    expect(all.total).toBe(2);
    expect(all.items.every((row) => row.contentItemId === item.id)).toBe(true);
    const own = await parse(await get(path, tenant, learnerUser(learnerId)), schema);
    expect(own.total).toBe(1);
    expect(own.items[0]?.learnerId).toBe(learnerId);
  });

  it("returns 404 for foreign item details and attempt filters", async () => {
    const foreign = mockDb.contentItems.find((row) => row.tenantId === TENANT.riverside)!;
    for (const path of [
      `/content-items/${foreign.id}`,
      `/content-attempts?contentItemId=${foreign.id}`,
    ]) {
      expect((await get(path, TENANT.littleSteps, USER.lsPriya)).status).toBe(404);
    }
  });

  it("requires both content read permission and entitlement", async () => {
    const tenant = TENANT.littleSteps;
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    const forbidden = await get("/content-items", tenant, USER.lsPriya);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M31",
    );
    const disabled = await get("/content-items", tenant, USER.lsPriya);
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
