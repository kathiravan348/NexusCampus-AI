import { ROLE_ASSIGNMENTS, SURVEY, TENANT, THEME_SUMMARY, resetMockDb, roleId } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSurvey, useSurveyResults, useSurveyThemes, useSurveys } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

describe("M44 hooks", () => {
  it("loads and parses survey lists, details, aggregate results and themes", async () => {
    const tenantId = TENANT.northbridge;
    const admin = ROLE_ASSIGNMENTS.find(
      (row) => row.roleId === roleId(tenantId, "admin") || row.roleId === roleId(tenantId, "owner"),
    )!;
    signInAs({ ...ADMIN, tenantId, userId: admin.userId });
    const surveyId = SURVEY.nbCourseFeedback;
    const { result } = renderHook(
      () => ({
        surveys: useSurveys(),
        survey: useSurvey(surveyId),
        results: useSurveyResults(surveyId),
        themes: useSurveyThemes(surveyId),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { surveys, survey, results, themes } = result.current;
      expect(surveys.data?.total).toBe(2);
      expect(survey.data?.id).toBe(surveyId);
      expect(results.data?.items).toHaveLength(2);
      expect(themes.data?.items.map((row) => row.id)).toEqual([THEME_SUMMARY.nbCoursePublished]);
    });
  });
});
