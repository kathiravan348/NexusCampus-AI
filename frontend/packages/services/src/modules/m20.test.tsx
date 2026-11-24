import { ASSESSMENT, CLASS_GROUP } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { useAssessmentMarks, useAssessments, useGradingSchemes, useRubrics } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M20 hooks", () => {
  it("loads and parses all module pages", async () => {
    signInAs(ADMIN);
    const assessmentId = ASSESSMENT.ls[0];
    const { result } = renderHook(
      () => ({
        schemes: useGradingSchemes(),
        assessments: useAssessments(CLASS_GROUP.lsSeedlings),
        rubrics: useRubrics(),
        marks: useAssessmentMarks(assessmentId),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.schemes.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.assessments.data?.items).toMatchObject([{ id: assessmentId }]);
      expect(result.current.rubrics.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.marks.data?.items[0]?.assessmentId).toBe(assessmentId);
    });
  });
});
