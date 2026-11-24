import { CALENDAR } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useClassGroups,
  usePrograms,
  useSubjectOfferings,
  useSubjects,
  useYearLevels,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M15 hooks", () => {
  it("loads academic structure including offerings filtered by academic year", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({
        programs: usePrograms(),
        yearLevels: useYearLevels(),
        classGroups: useClassGroups(),
        subjects: useSubjects(),
        offerings: useSubjectOfferings(CALENDAR.littleSteps),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.programs.data?.total).toBeGreaterThan(0);
      expect(result.current.yearLevels.data?.total).toBeGreaterThan(0);
      expect(result.current.classGroups.data?.total).toBeGreaterThan(0);
      expect(result.current.subjects.data?.total).toBeGreaterThan(0);
      expect(result.current.offerings.data?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ academicYearId: CALENDAR.littleSteps })]),
      );
    });
  });
});
