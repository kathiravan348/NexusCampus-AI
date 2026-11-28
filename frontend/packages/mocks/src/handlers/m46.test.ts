import {
  EngagementSnapshotSchema,
  InterventionSchema,
  RiskScoreSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { DEMO_NOW } from "../fixtures/compliance";
import { roleId, type SystemRoleKey } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

const tenant = TENANT.riverside;
const demoNowMs = Date.parse(DEMO_NOW);

function get(path: string, userId: string = USER.rvHelen, tenantId: string = tenant) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function signInAs(personId: string, role: SystemRoleKey) {
  const user = mockDb.users.find((row) => row.id === USER.rvHelen)!;
  user.personId = personId;
  const assignment = mockDb.roleAssignments.find((row) => row.userId === user.id)!;
  mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== user.id);
  mockDb.roleAssignments.push({ ...assignment, roleId: roleId(tenant, role) });
}

function riverside() {
  const snapshots = mockDb.engagementSnapshots.filter((row) => row.tenantId === tenant);
  const scores = mockDb.riskScores.filter((row) => row.tenantId === tenant);
  const activeScore = scores.find((row) => Date.parse(row.validUntil) >= demoNowMs)!;
  const expiredScore = scores.find((row) => Date.parse(row.validUntil) < demoNowMs)!;
  const oliverSnapshot = snapshots.find((row) => row.learnerId === activeScore.learnerId)!;
  const miaSnapshot = snapshots.find((row) => row.learnerId !== activeScore.learnerId)!;
  const intervention = mockDb.interventions.find((row) => row.tenantId === tenant)!;
  return { snapshots, activeScore, expiredScore, oliverSnapshot, miaSnapshot, intervention };
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

describe("M46 read handlers", () => {
  it("serves all M46 endpoints to an admin and hides expired risk scores", async () => {
    const { snapshots, activeScore, expiredScore, oliverSnapshot, intervention } = riverside();
    const engagement = await parse(await get("/engagement"), pageSchema(EngagementSnapshotSchema));
    expect(engagement.items).toEqual(snapshots);
    const byLearner = await parse(
      await get(`/engagement?learnerId=${oliverSnapshot.learnerId}`),
      pageSchema(EngagementSnapshotSchema),
    );
    expect(byLearner.items).toEqual([oliverSnapshot]);

    const scores = await parse(await get("/risk-scores"), pageSchema(RiskScoreSchema));
    expect(scores.items).toEqual([activeScore]);
    expect(scores.items.some((row) => row.id === expiredScore.id)).toBe(false);

    const lowScores = await parse(await get("/risk-scores?level=low"), pageSchema(RiskScoreSchema));
    expect(lowScores.items).toEqual([activeScore]);
    const highScores = await parse(
      await get("/risk-scores?level=high"),
      pageSchema(RiskScoreSchema),
    );
    expect(highScores.items).toEqual([]);
    const invalidLevel = await get("/risk-scores?level=critical");
    expect(invalidLevel.status).toBe(400);
    expect(await invalidLevel.json()).toMatchObject({ error: { code: "invalid_request" } });

    expect(await parse(await get(`/risk-scores/${activeScore.id}`), RiskScoreSchema)).toEqual(
      activeScore,
    );
    expect((await get(`/risk-scores/${expiredScore.id}`)).status).toBe(404);

    const interventions = await parse(await get("/interventions"), pageSchema(InterventionSchema));
    expect(interventions.items).toEqual([intervention]);
    const byInterventionLearner = await parse(
      await get(`/interventions?learnerId=${intervention.learnerId}`),
      pageSchema(InterventionSchema),
    );
    expect(byInterventionLearner.items).toEqual([intervention]);
  });

  it("limits a teacher to learners of their own course spaces", async () => {
    const { activeScore, expiredScore, oliverSnapshot, miaSnapshot, intervention } = riverside();
    const miaScore = {
      ...activeScore,
      id: "rsk-rv-mia-high",
      learnerId: miaSnapshot.learnerId,
      level: "high" as const,
    };
    mockDb.riskScores.push(miaScore);

    const tomProfile = mockDb.roleProfiles.find(
      (row) => row.id === intervention.ownerStaffProfileId,
    )!;
    signInAs(tomProfile.personId, "teacher");

    const engagement = await parse(await get("/engagement"), pageSchema(EngagementSnapshotSchema));
    expect(engagement.items).toEqual([oliverSnapshot]);
    expect((await get(`/engagement?learnerId=${miaSnapshot.learnerId}`)).status).toBe(404);

    const scores = await parse(await get("/risk-scores"), pageSchema(RiskScoreSchema));
    expect(scores.items).toEqual([activeScore]);
    expect((await get(`/risk-scores?learnerId=${miaSnapshot.learnerId}`)).status).toBe(404);
    expect((await get(`/risk-scores/${miaScore.id}`)).status).toBe(404);
    expect((await get(`/risk-scores/${expiredScore.id}`)).status).toBe(404);

    const interventions = await parse(await get("/interventions"), pageSchema(InterventionSchema));
    expect(interventions.items).toEqual([intervention]);
    expect((await get(`/interventions?learnerId=${miaSnapshot.learnerId}`)).status).toBe(404);
  });

  it("denies learners and guardians on every M46 endpoint", async () => {
    const { activeScore } = riverside();
    const learner = mockDb.learners.find((row) => row.id === activeScore.learnerId)!;
    const routes = [
      "/engagement",
      "/risk-scores",
      `/risk-scores/${activeScore.id}`,
      "/interventions",
    ];
    for (const role of ["learner", "guardian"] as const) {
      signInAs(learner.personId, role);
      for (const route of routes) {
        const res = await get(route);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
      }
    }
  });

  it("returns 404 for foreign learner and risk score IDs", async () => {
    const { activeScore, oliverSnapshot, intervention } = riverside();
    for (const route of [
      `/engagement?learnerId=${oliverSnapshot.learnerId}`,
      `/risk-scores?learnerId=${activeScore.learnerId}`,
      `/risk-scores/${activeScore.id}`,
      `/interventions?learnerId=${intervention.learnerId}`,
    ]) {
      expect((await get(route, USER.lsPriya, TENANT.littleSteps)).status).toBe(404);
    }
  });

  it("requires M46 permission and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    const forbidden = await get("/risk-scores");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M46",
    );
    const disabled = await get("/risk-scores");
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
