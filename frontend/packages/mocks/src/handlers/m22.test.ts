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
