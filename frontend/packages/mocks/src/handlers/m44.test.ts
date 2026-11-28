import {
  QuestionResultSchema,
  SurveySchema,
  ThemeSummarySchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, permissionsOf } from "../context";
import { mockDb, resetMockDb } from "../db";
import {
  FACULTY_RESULT_VIEWER_PROFILE_IDS,
  QUESTION_RESULTS,
  SURVEY,
  TENANT,
  THEME_SUMMARY,
  USER,
  roleId,
} from "../fixtures";
import { server } from "../node";

const nb = TENANT.northbridge;
const rv = TENANT.riverside;
const course = `/surveys/${SURVEY.nbCourseFeedback}`;
const faculty = `/surveys/${SURVEY.nbFacultyElena}`;
const routes = ["/surveys", course, `${course}/results`, `${course}/themes`];

function facultyViewer(index: number) {
  const id = FACULTY_RESULT_VIEWER_PROFILE_IDS[SURVEY.nbFacultyElena]![index];
  const profile = mockDb.roleProfiles.find((row) => row.id === id)!;
  return mockDb.users.find((row) => row.tenantId === nb && row.personId === profile.personId)!;
}

function get(path: string, userId = facultyViewer(1).id, tenantId: string = nb) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

async function readBody(response: Response, status = 200): Promise<unknown> {
  expect(response.status).toBe(status);
  const body = await response.text();
  expect(body).not.toContain('"respondentProfileId"');
  return JSON.parse(body);
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M44 read handlers", () => {
  it("serves survey lists, details, results and themes to a tenant admin", async () => {
    const surveys = pageSchema(SurveySchema).parse(await readBody(await get("/surveys")));
    expect(surveys.items.map((row) => row.id)).toEqual([
      SURVEY.nbCourseFeedback,
      SURVEY.nbFacultyElena,
    ]);
    expect(SurveySchema.parse(await readBody(await get(course))).id).toBe(SURVEY.nbCourseFeedback);
    const results = pageSchema(QuestionResultSchema).parse(
      await readBody(await get(`${course}/results`)),
    );
    expect(results.items).toEqual(
      QUESTION_RESULTS.filter((row) => row.surveyId === SURVEY.nbCourseFeedback),
    );
    const themes = pageSchema(ThemeSummarySchema).parse(
      await readBody(await get(`${course}/themes`)),
    );
    expect(themes.items.map((row) => row.id)).toEqual([THEME_SUMMARY.nbCoursePublished]);
  });

  it("filters by audience and status before paging or resolving details", async () => {
    const learner = mockDb.roleAssignments.find((row) => row.roleId === roleId(rv, "learner"))!;
    const parent = mockDb.surveys.find((row) => row.id === SURVEY.rvParentEvening)!;
    parent.status = "open";
    const ownDraft = mockDb.surveys.find((row) => row.id === SURVEY.rvGeneralLibrary)!;
    const page = pageSchema(SurveySchema);
    expect(
      page.parse(await readBody(await get("/surveys?pageSize=1", learner.userId, rv))),
    ).toMatchObject({ items: [], total: 0 });
    for (const id of [parent.id, ownDraft.id, SURVEY.rvStaffWellbeing]) {
      expect(await readBody(await get(`/surveys/${id}`, learner.userId, rv), 404)).toEqual({
        error: { code: "not_found", message: "Not found." },
      });
    }
    const adminSurveys = page.parse(await readBody(await get("/surveys", USER.rvHelen, rv)));
    expect(adminSurveys.items).toContainEqual(ownDraft);

    const nbLearner = page.parse(await readBody(await get("/surveys", USER.nbJordan)));
    expect(nbLearner.items.map((row) => row.id)).toEqual([
      SURVEY.nbCourseFeedback,
      SURVEY.nbFacultyElena,
    ]);
  });

  it("returns suppressed fixtures without deriving statistics from responses", async () => {
    mockDb.surveyResponses.length = 0;
    const path = `/surveys/${SURVEY.rvStaffWellbeing}/results`;
    const results = pageSchema(QuestionResultSchema).parse(
      await readBody(await get(path, USER.rvHelen, rv)),
    );
    expect(results.items).toEqual(
      QUESTION_RESULTS.filter((row) => row.surveyId === SURVEY.rvStaffWellbeing),
    );
    expect(results.items).toMatchObject([
      { suppressed: true, responseCount: 2, distribution: null, average: null },
    ]);
  });

  it("requires a listed faculty profile beyond the results grant", async () => {
    const teacher = facultyViewer(0);
    const manager = facultyViewer(1);
    const paths = [`${faculty}/results`, `${faculty}/themes`];
    expect(permissionsOf(teacher.id).has("m44.results.read")).toBe(true);
    for (const path of paths) {
      await readBody(await get(path, manager.id));
      await readBody(await get(path, teacher.id));
    }

    const subject = mockDb.roleProfiles.find(
      (profile) => profile.personId === teacher.personId && profile.kind === "staff",
    )!;
    mockDb.roleProfiles = mockDb.roleProfiles.map((profile) =>
      profile.id === subject.id ? { ...profile, id: "staff-nb-unlisted" } : profile,
    );

    for (const path of paths) {
      expect(await readBody(await get(path, teacher.id), 404)).toMatchObject({
        error: { code: "not_found" },
      });
    }
  });

  it("returns 404 for another tenant's survey, results or themes", async () => {
    for (const path of routes.slice(1)) {
      expect(await readBody(await get(path, USER.rvHelen, rv), 404)).toMatchObject({
        error: { code: "not_found" },
      });
    }
  });

  it("requires the appropriate grants", async () => {
    for (const path of routes.slice(2)) {
      expect(await readBody(await get(path, USER.nbJordan), 403)).toMatchObject({
        error: { code: "forbidden" },
      });
    }

    const admin = facultyViewer(1);
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== admin.id);
    for (const path of routes) {
      expect(await readBody(await get(path, admin.id), 403)).toMatchObject({
        error: { code: "forbidden" },
      });
    }
  });

  it("requires M44 entitlement", async () => {
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== nb || row.moduleId !== "M44",
    );
    for (const path of routes) {
      expect(await readBody(await get(path), 403)).toMatchObject({
        error: { code: "module_disabled" },
      });
    }
  });
});
