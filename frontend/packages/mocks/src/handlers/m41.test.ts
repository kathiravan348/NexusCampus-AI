import {
  CatalogueCourseSchema,
  ClassSessionSchema,
  LevelExamSchema,
  MediaItemSchema,
  PackPurchaseSchema,
  PracticeFeedbackSchema,
  SessionBookingSchema,
  SessionPackSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { CLASS_SESSION, LEARNER, PRACTICE_MEDIA, TENANT, USER } from "../fixtures";
import { server } from "../node";
import type { Parser } from "./route";

const hm = TENANT.harmony;

function get(path: string, userId: string = USER.hmWeiLing, tenantId: string = hm) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
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

describe("M41 read handlers", () => {
  it("serves all M41 endpoints, filters and merged practice media to staff", async () => {
    const courses = await parse(await get("/catalogue-courses"), pageSchema(CatalogueCourseSchema));
    expect(courses.items).toEqual(mockDb.catalogueCourses.filter((row) => row.tenantId === hm));

    const packs = await parse(await get("/session-packs"), pageSchema(SessionPackSchema));
    expect(packs.items).toEqual(mockDb.sessionPacks.filter((row) => row.tenantId === hm));

    const purchases = await parse(
      await get(`/pack-purchases?learnerId=${LEARNER.hmChloe}`),
      pageSchema(PackPurchaseSchema),
    );
    expect(purchases.items).toEqual(
      mockDb.packPurchases.filter(
        (row) => row.tenantId === hm && row.learnerId === LEARNER.hmChloe,
      ),
    );

    const allSessions = await parse(await get("/class-sessions"), pageSchema(ClassSessionSchema));
    expect(allSessions.items).toEqual(mockDb.classSessions.filter((row) => row.tenantId === hm));

    const byDate = await parse(
      await get("/class-sessions?from=2026-11-22&to=2026-11-27"),
      pageSchema(ClassSessionSchema),
    );
    expect(byDate.items).toHaveLength(3);

    const byUtc = await parse(
      await get("/class-sessions?from=2026-12-01T00:00:00Z&to=2026-12-05T00:00:00Z"),
      pageSchema(ClassSessionSchema),
    );
    expect(byUtc.items).toHaveLength(2);

    const badDate = await get("/class-sessions?from=not-a-date");
    expect(badDate.status).toBe(400);
    expect(await badDate.json()).toMatchObject({ error: { code: "invalid_request" } });

    const reversed = await get("/class-sessions?from=2026-12-10&to=2026-12-01");
    expect(reversed.status).toBe(400);
    expect(await reversed.json()).toMatchObject({ error: { code: "invalid_request" } });

    const bookings = await parse(
      await get(`/session-bookings?sessionId=${CLASS_SESSION.hmTrial}`),
      pageSchema(SessionBookingSchema),
    );
    expect(bookings.items).toEqual(
      mockDb.sessionBookings.filter(
        (row) => row.tenantId === hm && row.sessionId === CLASS_SESSION.hmTrial,
      ),
    );

    const exams = await parse(
      await get(`/level-exams?learnerId=${LEARNER.hmRachel}`),
      pageSchema(LevelExamSchema),
    );
    expect(exams.items).toEqual(
      mockDb.levelExams.filter((row) => row.tenantId === hm && row.learnerId === LEARNER.hmRachel),
    );

    const feedback = await parse(
      await get(`/practice-feedback?learnerId=${LEARNER.hmMarcus}`),
      pageSchema(PracticeFeedbackSchema),
    );
    expect(feedback.items).toEqual(
      mockDb.practiceFeedback.filter(
        (row) => row.tenantId === hm && row.learnerId === LEARNER.hmMarcus,
      ),
    );

    // Practice media joined the existing media collection.
    const media = await parse(await get("/media-items"), pageSchema(MediaItemSchema));
    expect(media.items.map((row) => row.id)).toEqual([
      PRACTICE_MEDIA.hmDraft,
      PRACTICE_MEDIA.hmShared,
    ]);

    // Teachers also have m41.course.read.
    expect((await get("/catalogue-courses", USER.hmPriya)).status).toBe(200);
  });

  it("denies learners and guardians on every M41 endpoint", async () => {
    const routes = [
      "/catalogue-courses",
      "/session-packs",
      "/pack-purchases",
      "/class-sessions",
      "/session-bookings",
      "/level-exams",
      "/practice-feedback",
    ];
    for (const userId of [USER.hmRachel, USER.hmMei]) {
      for (const route of routes) {
        const res = await get(route, userId);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
      }
    }
  });

  it("returns 404 for another tenant's IDs", async () => {
    const otherSession = {
      ...mockDb.classSessions[0]!,
      id: "css-rv-other",
      tenantId: TENANT.riverside,
    };
    mockDb.classSessions.push(otherSession);

    for (const route of [
      `/pack-purchases?learnerId=${LEARNER.rvMia}`,
      `/session-bookings?sessionId=${otherSession.id}`,
      `/level-exams?learnerId=${LEARNER.rvMia}`,
      `/practice-feedback?learnerId=${LEARNER.rvMia}`,
    ]) {
      expect((await get(route)).status).toBe(404);
    }
  });

  it("requires M41 permission and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.hmWeiLing);
    const forbidden = await get("/catalogue-courses");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    const disabled = await get("/catalogue-courses", USER.rvHelen, TENANT.riverside);
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
