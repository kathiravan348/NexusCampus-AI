import { IssuedDocumentSchema, pageSchema } from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { LEARNER, TENANT, USER } from "../fixtures";
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

describe("M23 read handlers", () => {
  it("lists tenant-local records for admins", async () => {
    const endpoints = [["/issued-documents", pageSchema(IssuedDocumentSchema)]] as const;
    for (const [path, schema] of endpoints) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const { items } = schema.parse(await response.json());
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    }
  });

  it("returns family documents and excludes unrelated learners and staff letters", async () => {
    const document = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.littleSteps)!;
    document.learnerId = LEARNER.lsRohan;
    mockDb.issuedDocuments.push(
      { ...document, learnerId: LEARNER.lsKavya },
      { ...document, learnerId: null, kind: "letter" },
    );

    const response = await get("/issued-documents", USER.lsSunita);
    expect(response.status).toBe(200);
    const { items } = pageSchema(IssuedDocumentSchema).parse(await response.json());
    expect(items).toContainEqual(document);
    for (const row of items) {
      expect([LEARNER.lsRohan, LEARNER.lsIshaan]).toContain(row.learnerId);
    }

    const filtered = await get(`/issued-documents?learnerId=${LEARNER.lsRohan}`, USER.lsSunita);
    expect(pageSchema(IssuedDocumentSchema).parse(await filtered.json()).items).toEqual(
      items.filter((row) => row.learnerId === LEARNER.lsRohan),
    );
    expect(
      (await get(`/issued-documents?learnerId=${LEARNER.lsKavya}`, USER.lsSunita)).status,
    ).toBe(404);
    expect((await get(`/issued-documents?learnerId=${LEARNER.rvOliver}`)).status).toBe(404);
  });

  it("denies an account without the read permission or family access", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/issued-documents")).status).toBe(403);
  });
});
