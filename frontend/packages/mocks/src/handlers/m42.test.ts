import {
  DegreeAuditSchema,
  ElectiveRegistrationSchema,
  PathAdviceSchema,
  ProgramRequirementSchema,
  RegistrationWindowSchema,
  ThesisSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb, resetMockDb } from "../db";
import {
  DEGREE_AUDIT,
  ELECTIVE_REGISTRATION,
  LEARNER,
  PATH_ADVICE_ID,
  ROLE_ASSIGNMENTS,
  REGISTRATION_WINDOW,
  TENANT,
  THESIS,
  USER,
  roleId,
} from "../fixtures";
import { server } from "../node";
import type { Parser } from "./route";

const nb = TENANT.northbridge;
const admin = ROLE_ASSIGNMENTS.find(
  (row) => row.roleId === roleId(nb, "admin") || row.roleId === roleId(nb, "owner"),
)!.userId;
const routes = [
  "/program-requirements",
  "/registration-windows",
  "/elective-registrations",
  "/degree-audits",
  "/theses",
  "/path-advice",
] as const;

function get(path: string, userId: string = admin, tenantId: string = nb) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

async function readBody(response: Response): Promise<unknown> {
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).not.toMatch(/\b(?:\d[ -]?){12,18}\d\b/);
  return JSON.parse(body);
}

async function parse<T>(response: Response, schema: Parser<T>): Promise<T> {
  return schema.parse(await readBody(response));
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M42 read handlers", () => {
  it("serves all six tenant-scoped lists to an admin", async () => {
    const cases = [
      [routes[0], pageSchema(ProgramRequirementSchema), mockDb.programRequirements],
      [routes[1], pageSchema(RegistrationWindowSchema), mockDb.registrationWindows],
      [routes[2], pageSchema(ElectiveRegistrationSchema), mockDb.electiveRegistrations],
      [routes[3], pageSchema(DegreeAuditSchema), mockDb.degreeAudits],
      [routes[4], pageSchema(ThesisSchema), mockDb.theses],
      [routes[5], pageSchema(PathAdviceSchema), mockDb.pathAdvice],
    ] as const;
    for (const [route, schema, rows] of cases) {
      const items = rows.filter((row) => row.tenantId === nb);
      expect(items.length).toBeGreaterThan(0);
      expect(schema.parse(await readBody(await get(route)))).toEqual({
        items,
        total: items.length,
        page: 1,
        pageSize: expect.any(Number),
      });
    }
  });

  it("filters registration, audit, thesis and advice rows by local IDs", async () => {
    const registrations = await parse(
      await get(
        `/elective-registrations?learnerId=${LEARNER.nbJordan}&windowId=${REGISTRATION_WINDOW.nbSpringOpen}`,
      ),
      pageSchema(ElectiveRegistrationSchema),
    );
    expect(registrations.items.map((row) => row.id)).toEqual([ELECTIVE_REGISTRATION.nbWithdrawn]);

    const audits = await parse(
      await get(`/degree-audits?learnerId=${LEARNER.nbAiden}`),
      pageSchema(DegreeAuditSchema),
    );
    expect(audits.items.map((row) => row.id)).toEqual([DEGREE_AUDIT.nbAidenProgress]);

    const theses = await parse(
      await get(`/theses?learnerId=${LEARNER.nbJordan}`),
      pageSchema(ThesisSchema),
    );
    expect(theses.items.map((row) => row.id)).toEqual([THESIS.nbSubmitted]);

    const advice = await parse(
      await get(`/path-advice?learnerId=${LEARNER.nbJordan}`),
      pageSchema(PathAdviceSchema),
    );
    expect(advice.items.map((row) => row.id)).toEqual([PATH_ADVICE_ID.nbDraft]);
  });

  it("filters drafts before paging for a teacher without decision permission", async () => {
    const teacher = mockDb.users.find((row) => {
      if (row.tenantId !== nb || row.status !== "active") return false;
      const isTeacher = mockDb.roleAssignments.some(
        (assignment) => assignment.userId === row.id && assignment.roleId === roleId(nb, "teacher"),
      );
      const permissions = permissionsOf(row.id);
      return (
        isTeacher &&
        permissions.has("m42.audit.read") &&
        !permissions.has("m42.registration.decide")
      );
    })!;
    const advice = await parse(
      await get("/path-advice?pageSize=1", teacher.id),
      pageSchema(PathAdviceSchema),
    );
    expect(advice.total).toBe(1);
    expect(advice.items.map((row) => row.id)).toEqual([PATH_ADVICE_ID.nbReviewed]);
    const draftLearner = await parse(
      await get(`/path-advice?learnerId=${LEARNER.nbJordan}`, teacher.id),
      pageSchema(PathAdviceSchema),
    );
    expect(draftLearner).toMatchObject({ items: [], total: 0 });
  });

  it("returns generic 404s for foreign learner and window IDs", async () => {
    const foreignWindow = {
      ...mockDb.registrationWindows[0]!,
      id: "rgw-rv-other",
      tenantId: TENANT.riverside,
    };
    mockDb.registrationWindows.push(foreignWindow);

    for (const path of [
      ...routes.slice(2).map((route) => `${route}?learnerId=${LEARNER.rvMia}`),
      `/elective-registrations?windowId=${foreignWindow.id}`,
    ]) {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "Not found." },
      });
    }
  });

  it("denies learners, guardians and users without grants on every endpoint", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter(
      (row) =>
        row.userId !== admin &&
        (row.userId !== USER.nbMarcus || row.roleId === roleId(nb, "guardian")),
    );
    for (const userId of [USER.nbJordan, USER.nbMarcus, admin]) {
      for (const route of routes) {
        const response = await get(route, userId);
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
      }
    }
  });

  it("requires M42 entitlement", async () => {
    const response = await get("/program-requirements", USER.rvHelen, TENANT.riverside);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "module_disabled" } });
  });
});
