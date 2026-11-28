import {
  AccommodationSchema,
  GoalProgressSchema,
  SupportGoalSchema,
  SupportPlanSchema,
  SupportSessionSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { LEARNER, PERSON, SUPPORT_PLAN, TENANT, USER } from "../fixtures";
import { roleId, type SystemRoleKey } from "../fixtures/ids";
import { server } from "../node";
import type { Parser } from "./route";

const tenant = TENANT.riverside;

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

describe("M38 read handlers", () => {
  it("serves all M38 endpoints to an admin with m38.plan.manage", async () => {
    const rvPlans = mockDb.supportPlans.filter((row) => row.tenantId === tenant);
    const reading = rvPlans.find((row) => row.id === SUPPORT_PLAN.rvReading)!;

    const plans = await parse(await get("/support-plans"), pageSchema(SupportPlanSchema));
    expect(plans.items).toEqual(rvPlans);

    const byLearner = await parse(
      await get(`/support-plans?learnerId=${LEARNER.rvMia}`),
      pageSchema(SupportPlanSchema),
    );
    expect(byLearner.items).toEqual([reading]);

    expect(await parse(await get(`/support-plans/${reading.id}`), SupportPlanSchema)).toEqual(
      reading,
    );

    const goals = await parse(
      await get(`/support-plans/${reading.id}/goals`),
      pageSchema(SupportGoalSchema),
    );
    expect(goals.items).toEqual(mockDb.supportGoals.filter((row) => row.planId === reading.id));

    const accommodations = await parse(
      await get(`/support-plans/${reading.id}/accommodations`),
      pageSchema(AccommodationSchema),
    );
    expect(accommodations.items).toEqual(
      mockDb.accommodations.filter((row) => row.planId === reading.id),
    );

    const sessions = await parse(
      await get(`/support-plans/${reading.id}/sessions`),
      pageSchema(SupportSessionSchema),
    );
    expect(sessions.items).toEqual(
      mockDb.supportSessions.filter((row) => row.planId === reading.id),
    );

    const goalIds = new Set(goals.items.map((row) => row.id));
    const progress = await parse(
      await get(`/support-plans/${reading.id}/progress`),
      pageSchema(GoalProgressSchema),
    );
    expect(progress.items).toEqual(mockDb.goalProgress.filter((row) => goalIds.has(row.goalId)));
  });

  it("limits a teacher to plans where they are coordinator or team member", async () => {
    const reading = mockDb.supportPlans.find((row) => row.id === SUPPORT_PLAN.rvReading)!;
    signInAs(PERSON.rvAmira, "teacher");

    const plans = await parse(await get("/support-plans"), pageSchema(SupportPlanSchema));
    expect(plans.items).toEqual([reading]);
    expect(await parse(await get(`/support-plans/${reading.id}`), SupportPlanSchema)).toEqual(
      reading,
    );

    for (const route of [
      `/support-plans?learnerId=${LEARNER.rvElla}`,
      `/support-plans/${SUPPORT_PLAN.rvReview}`,
      `/support-plans/${SUPPORT_PLAN.rvReview}/goals`,
      `/support-plans/${SUPPORT_PLAN.rvReview}/accommodations`,
      `/support-plans/${SUPPORT_PLAN.rvReview}/sessions`,
      `/support-plans/${SUPPORT_PLAN.rvReview}/progress`,
    ]) {
      expect((await get(route)).status).toBe(404);
    }

    // Team member (not coordinator) on rvReading, coordinator on rvReview.
    signInAs(PERSON.rvHelen, "teacher");
    const teamPlans = await parse(await get("/support-plans"), pageSchema(SupportPlanSchema));
    expect(teamPlans.items.map((row) => row.id)).toEqual([
      SUPPORT_PLAN.rvReading,
      SUPPORT_PLAN.rvReview,
    ]);
  });

  it("denies learners and guardians on every M38 endpoint", async () => {
    const routes = [
      "/support-plans",
      `/support-plans/${SUPPORT_PLAN.rvReading}`,
      `/support-plans/${SUPPORT_PLAN.rvReading}/goals`,
      `/support-plans/${SUPPORT_PLAN.rvReading}/accommodations`,
      `/support-plans/${SUPPORT_PLAN.rvReading}/sessions`,
      `/support-plans/${SUPPORT_PLAN.rvReading}/progress`,
    ];
    for (const role of ["learner", "guardian"] as const) {
      signInAs(PERSON.rvMia, role);
      for (const route of routes) {
        const res = await get(route);
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ error: { code: "forbidden" } });
      }
    }
  });

  it("returns 404 for another tenant's learner and support plan IDs", async () => {
    for (const route of [
      `/support-plans?learnerId=${LEARNER.nbJordan}`,
      `/support-plans/${SUPPORT_PLAN.nbAccess}`,
      `/support-plans/${SUPPORT_PLAN.nbAccess}/goals`,
      `/support-plans/${SUPPORT_PLAN.nbAccess}/accommodations`,
      `/support-plans/${SUPPORT_PLAN.nbAccess}/sessions`,
      `/support-plans/${SUPPORT_PLAN.nbAccess}/progress`,
    ]) {
      expect((await get(route)).status).toBe(404);
    }
  });

  it("requires M38 permission and module entitlement", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    const forbidden = await get("/support-plans");
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: "forbidden" } });

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== tenant || row.moduleId !== "M38",
    );
    const disabled = await get("/support-plans");
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
