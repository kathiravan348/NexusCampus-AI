import { IssuedDocumentReadSchema, IssuedDocumentSchema, pageSchema } from "@nexus/contracts";
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

  it("redacts revocation reasons for family reads", async () => {
    const document = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.littleSteps)!;
    Object.assign(document, {
      learnerId: LEARNER.lsRohan,
      revoked: true,
      revokedReason: "Replaced by a corrected copy",
    });

    const staff = await get("/issued-documents", USER.lsPriya);
    expect(staff.status).toBe(200);
    const staffPage = pageSchema(IssuedDocumentReadSchema).parse(await staff.json());
    const staffRow = staffPage.items.find((row) => row.id === document.id);
    expect(staffRow?.revokedReason).toBe("Replaced by a corrected copy");

    const family = await get("/issued-documents", USER.lsSunita);
    expect(family.status).toBe(200);
    const familyPage = pageSchema(IssuedDocumentReadSchema).parse(await family.json());
    const familyRow = familyPage.items.find((row) => row.id === document.id);
    expect(familyRow?.revoked).toBe(true);
    expect(familyRow?.revokedReason).toBeNull();
  });
});

function postRevoke(id: string, body: unknown, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1/issued-documents/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    headers: {
      [MOCK_HEADER.tenant]: TENANT.littleSteps,
      [MOCK_HEADER.user]: user,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("M23 revocation handler", () => {
  it("revokes an active document and rejects a second revocation with conflict", async () => {
    const document = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.littleSteps)!;
    const response = await postRevoke(document.id, { reason: "  Superseded by reissue  " });
    expect(response.status).toBe(200);
    const updated = IssuedDocumentSchema.parse(await response.json());
    expect(updated.revoked).toBe(true);
    expect(updated.revokedReason).toBe("Superseded by reissue");
    expect(document.revoked).toBe(true);
    expect(document.revokedReason).toBe("Superseded by reissue");

    const snapshot = structuredClone(document);
    const second = await postRevoke(document.id, { reason: "Another reason" });
    expect(second.status).toBe(409);
    const secondBody = await second.json();
    expect(secondBody).toMatchObject({
      error: { code: "conflict", details: [{ path: "revoked" }] },
    });
    expect(JSON.stringify(secondBody)).not.toContain("Another reason");
    expect(document).toEqual(snapshot);
  });

  it("rejects empty, oversized or malformed reasons without leaking input values", async () => {
    const document = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.littleSteps)!;
    const original = structuredClone(document);
    const oversized = "r".repeat(301);
    for (const body of [{ reason: "" }, { reason: "   " }, { reason: oversized }, {}]) {
      const response = await postRevoke(document.id, body);
      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload).toMatchObject({
        error: { code: "invalid_request", details: [{ path: "reason" }] },
      });
      expect(JSON.stringify(payload)).not.toContain(oversized);
      expect(JSON.stringify(payload)).not.toContain(document.number);
    }
    expect(document).toEqual(original);
  });

  it("denies teachers without issue permission and hides foreign documents", async () => {
    const document = mockDb.issuedDocuments.find((row) => row.tenantId === TENANT.littleSteps)!;
    const foreign = mockDb.issuedDocuments.find((row) => row.tenantId !== TENANT.littleSteps)!;
    const original = structuredClone(document);
    const foreignOriginal = structuredClone(foreign);

    expect((await postRevoke(document.id, { reason: "Valid" }, USER.lsArjun)).status).toBe(403);
    expect((await postRevoke(foreign.id, { reason: "Valid" })).status).toBe(404);
    expect(document).toEqual(original);
    expect(foreign).toEqual(foreignOriginal);
  });
});
