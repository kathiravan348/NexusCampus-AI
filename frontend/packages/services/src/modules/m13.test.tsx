import { LEARNER } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import { useLearner, useLearnerDocuments, useLearnerEnrolments, useLearners } from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M13 hooks", () => {
  it("loads the learner list, a learner, and their enrolments and documents", async () => {
    signInAs(ADMIN);
    const learnerId = LEARNER.lsKavya;
    const { result } = renderHook(
      () => ({
        learners: useLearners(),
        learner: useLearner(learnerId),
        enrolments: useLearnerEnrolments(learnerId),
        documents: useLearnerDocuments(learnerId),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.learners.data?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: learnerId })]),
      );
      expect(result.current.learner.data).toMatchObject({
        id: learnerId,
        tenantId: ADMIN.tenantId,
      });
      expect(result.current.enrolments.data?.items).toMatchObject([{ learnerId }]);
      expect(result.current.documents.data?.items).toMatchObject([{ learnerId }]);
    });
  });
});
