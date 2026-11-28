import {
  DaySummarySchema,
  DiaryEntrySchema,
  MilestoneProgressSchema,
  ObservationSchema,
  PickupCheckSchema,
  RatioSnapshotSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { LEARNER, OBSERVATION, TENANT, USER } from "../fixtures";
import { roleId, type SystemRoleKey } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

const tenant = TENANT.littleSteps;

function get(path: string, userId: string = USER.lsPriya, tenantId: string = tenant) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function signInAs(personId: string, role: SystemRoleKey) {
  const user = mockDb.users.find((row) => row.id === USER.lsPriya)!;
  user.personId = personId;
  const assignment = mockDb.roleAssignments.find((row) => row.userId === user.id)!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== user.id);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenant, role) });
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

describe("M37 read handlers", () => {
  it("serves all M37 endpoints and filters to an admin", async () => {
    const diary = await parse(await get("/diary-entries"), pageSchema(DiaryEntrySchema));
    expect(diary.items).toEqual(mockDb.diaryEntries.filter((row) => row.tenantId === tenant));

    const byLearnerAndDate = await parse(
      await get(`/diary-entries?learnerId=${LEARNER.lsKavya}&date=2026-09-14`),
      pageSchema(DiaryEntrySchema),
    );
    expect(byLearnerAndDate.items).toEqual(
      mockDb.diaryEntries.filter(
        (row) => row.tenantId === tenant && row.learnerId === LEARNER.lsKavya,
      ),
    );
    const otherDate = await parse(
      await get("/diary-entries?date=2026-09-15"),
      pageSchema(DiaryEntrySchema),
    );
    expect(otherDate.items).toEqual([]);
    const badDate = await get("/diary-entries?date=not-a-date");
    expect(badDate.status).toBe(400);
    expect(await badDate.json()).toMatchObject({ error: { code: "invalid_request" } });

    const obs = await parse(await get("/observations"), pageSchema(ObservationSchema));
    expect(obs.items).toEqual(mockDb.observations.filter((row) => row.tenantId === tenant));

    const milestones = await parse(
      await get(`/milestone-progress?learnerId=${LEARNER.lsIshaan}`),
      pageSchema(MilestoneProgressSchema),
    );
    expect(milestones.items).toEqual(
      mockDb.milestoneProgress.filter((row) => row.tenantId === tenant),
    );

    const summaries = await parse(await get("/day-summaries"), pageSchema(DaySummarySchema));
    expect(summaries.items).toEqual(mockDb.daySummaries.filter((row) => row.tenantId === tenant));

    const pickups = await parse(
      await get(`/pickup-checks?learnerId=${LEARNER.lsKavya}&date=2026-09-14`),
      pageSchema(PickupCheckSchema),
    );
    expect(pickups.items).toEqual(
      mockDb.pickupChecks.filter(
        (row) => row.tenantId === tenant && row.learnerId === LEARNER.lsKavya,
      ),
    );

    const ratios = await parse(await get("/ratio-snapshots"), pageSchema(RatioSnapshotSchema));
    expect(ratios.items).toEqual(mockDb.ratioSnapshots.filter((row) => row.tenantId === tenant));
  });

  it("limits guardians to own children's shared records and denies pick-ups", async () => {
    const ishaan = mockDb.learners.find((row) => row.id === LEARNER.lsIshaan)!;
    const rel = mockDb.guardianRelationships.find(
      (row) => row.tenantId === tenant && row.learnerPersonId === ishaan.personId,
    )!;
    const ishaanDiary = mockDb.diaryEntries.find((row) => row.learnerId === LEARNER.lsIshaan)!;
    const privateDiary = { ...ishaanDiary, id: "diary-ls-private", sharedWithFamily: false };
    mockDb.diaryEntries.push(privateDiary);

    const sharedObs = mockDb.observations.find((row) => row.id === OBSERVATION.turnTaking)!;
    const privateObs = {
      ...sharedObs,
      id: "obs-ls-private",
      learnerIds: [LEARNER.lsIshaan],
      sharedWithFamily: false,
    };
    mockDb.observations.push(privateObs);

    const sentKavya = mockDb.daySummaries.find((row) => row.status === "sent")!;
    const sentIshaan = { ...sentKavya, id: "dsm-ls-ishaan-sent", learnerId: LEARNER.lsIshaan };
    mockDb.daySummaries.push(sentIshaan);

    signInAs(rel.guardianPersonId, "guardian");

    const diary = await parse(await get("/diary-entries"), pageSchema(DiaryEntrySchema));
    expect(diary.items.length).toBeGreaterThan(0);
    expect(diary.items.every((row) => row.learnerId === LEARNER.lsIshaan)).toBe(true);
    expect(diary.items.every((row) => row.sharedWithFamily)).toBe(true);
    expect(diary.items.some((row) => row.id === privateDiary.id)).toBe(false);
    expect((await get(`/diary-entries?learnerId=${LEARNER.lsKavya}`)).status).toBe(404);

    const obs = await parse(await get("/observations"), pageSchema(ObservationSchema));
    expect(obs.items).toHaveLength(1);
    expect(obs.items[0]?.id).toBe(OBSERVATION.turnTaking);
    expect(obs.items[0]?.learnerIds).toEqual([LEARNER.lsIshaan]);
    expect((await get(`/observations?learnerId=${LEARNER.lsKavya}`)).status).toBe(404);

    const milestones = await parse(
      await get("/milestone-progress"),
      pageSchema(MilestoneProgressSchema),
    );
    expect(milestones.items.every((row) => row.learnerId === LEARNER.lsIshaan)).toBe(true);
    expect((await get(`/milestone-progress?learnerId=${LEARNER.lsKavya}`)).status).toBe(404);

    const summaries = await parse(await get("/day-summaries"), pageSchema(DaySummarySchema));
    expect(summaries.items).toEqual([sentIshaan]);
    expect((await get(`/day-summaries?learnerId=${LEARNER.lsKavya}`)).status).toBe(404);

    for (const route of ["/pickup-checks", "/ratio-snapshots"]) {
      const res = await get(route);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("denies learners on all M37 endpoints", async () => {
    const ishaan = mockDb.learners.find((row) => row.id === LEARNER.lsIshaan)!;
    signInAs(ishaan.personId, "learner");
    for (const route of [
      "/diary-entries",
      "/observations",
      "/milestone-progress",
      "/day-summaries",
      "/pickup-checks",
      "/ratio-snapshots",
    ]) {
      const res = await get(route);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
    }
  });

  it("returns 404 for another tenant's learner ID", async () => {
    for (const route of [
      `/diary-entries?learnerId=${LEARNER.rvMia}`,
      `/observations?learnerId=${LEARNER.rvMia}`,
      `/milestone-progress?learnerId=${LEARNER.rvMia}`,
      `/day-summaries?learnerId=${LEARNER.rvMia}`,
      `/pickup-checks?learnerId=${LEARNER.rvMia}`,
    ]) {
      expect((await get(route)).status).toBe(404);
    }
  });

  it("requires M37 permissions and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    const forbidden = await get("/diary-entries");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    const disabled = await get("/diary-entries", USER.rvHelen, TENANT.riverside);
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
