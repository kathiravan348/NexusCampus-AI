import { ReportCardSchema, pageSchema } from "@nexus/contracts";
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

describe("M22 read handlers", () => {
  it("lists tenant-local records for admins", async () => {
    const endpoints = [["/report-cards", pageSchema(ReportCardSchema)]] as const;
    for (const [path, schema] of endpoints) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const { items } = schema.parse(await response.json());
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    }
  });

  it("returns only published family cards to a guardian", async () => {
    const card = mockDb.reportCards.find(
      (row) => row.tenantId === TENANT.littleSteps && row.status === "published",
    )!;
    card.learnerId = LEARNER.lsRohan;
    mockDb.reportCards.push(
      { ...card, status: "draft", publishedAt: null },
      { ...card, learnerId: LEARNER.lsKavya },
    );

    const response = await get("/report-cards", USER.lsSunita);
    expect(response.status).toBe(200);
    const { items } = pageSchema(ReportCardSchema).parse(await response.json());
    expect(items).toContainEqual(card);
    for (const row of items) {
      expect([LEARNER.lsRohan, LEARNER.lsIshaan]).toContain(row.learnerId);
      expect(row.status).toBe("published");
    }

    const filtered = await get(`/report-cards?learnerId=${LEARNER.lsRohan}`, USER.lsSunita);
    expect(pageSchema(ReportCardSchema).parse(await filtered.json()).items).toEqual(
      items.filter((row) => row.learnerId === LEARNER.lsRohan),
    );
    expect((await get(`/report-cards?learnerId=${LEARNER.lsKavya}`, USER.lsSunita)).status).toBe(
      404,
    );
    expect((await get(`/report-cards?learnerId=${LEARNER.rvOliver}`)).status).toBe(404);
  });

  it("denies an account without the read permission or family access", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/report-cards")).status).toBe(403);
  });
});

function postStatus(id: string, body: unknown, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1/report-cards/${encodeURIComponent(id)}/status`, {
    method: "POST",
    headers: {
      [MOCK_HEADER.tenant]: TENANT.littleSteps,
      [MOCK_HEADER.user]: user,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("M22 status changes", () => {
  it("enforces the publication sequence and removes withdrawn cards from family results", async () => {
    const card = mockDb.reportCards.find((row) => row.tenantId === TENANT.littleSteps)!;
    Object.assign(card, { learnerId: LEARNER.lsRohan, status: "draft", publishedAt: null });
    const original = structuredClone(card);
    const skipped = await postStatus(card.id, { status: "published" });
    expect(skipped.status).toBe(409);
    expect(await skipped.json()).toMatchObject({
      error: { code: "conflict", details: [{ path: "status" }] },
    });
    expect(card).toEqual(original);

    for (const status of ["approved", "published", "withdrawn"]) {
      const response = await postStatus(card.id, { status });
      expect(response.status).toBe(200);
      const updated = ReportCardSchema.parse(await response.json());
      expect(updated.status).toBe(status);
      expect(updated.publishedAt).toBe(status === "published" ? updated.updatedAt : null);
      const family = await get("/report-cards", USER.lsSunita);
      const { items } = pageSchema(ReportCardSchema).parse(await family.json());
      expect(items.some((row) => row.id === card.id)).toBe(status === "published");
    }

    const terminal = structuredClone(card);
    for (const status of ["approved", "published", "withdrawn"]) {
      expect((await postStatus(card.id, { status })).status).toBe(409);
    }
    expect(card).toEqual(terminal);
  });

  it("denies family writes, rejects extra input and hides foreign cards", async () => {
    const card = mockDb.reportCards.find((row) => row.tenantId === TENANT.littleSteps)!;
    const foreign = mockDb.reportCards.find((row) => row.tenantId !== TENANT.littleSteps)!;
    const original = structuredClone(card);
    expect((await postStatus(card.id, { status: "withdrawn" }, USER.lsSunita)).status).toBe(403);
    expect((await postStatus(card.id, { status: "withdrawn", extra: true })).status).toBe(400);
    expect((await postStatus(foreign.id, { status: "approved" })).status).toBe(404);
    expect(card).toEqual(original);
  });
});
