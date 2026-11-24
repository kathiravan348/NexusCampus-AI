import { CALENDAR, CAMPUS, PROGRAM, YEAR_LEVEL, resetMockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useClassGroups,
  useCreateClassGroup,
  usePrograms,
  useSubjectOfferings,
  useSubjects,
  useYearLevels,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => resetMockDb());

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

  it("creates a class group and invalidates M15 queries", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => ({ classGroups: useClassGroups(), create: useCreateClassGroup() }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => expect(result.current.classGroups.data?.total).toBeGreaterThan(0));
    const before = result.current.classGroups.data!.total;

    await act(async () => {
      await result.current.create.mutateAsync({
        campusId: CAMPUS.littleSteps,
        academicYearId: CALENDAR.littleSteps,
        programId: PROGRAM.littleSteps,
        yearLevelId: YEAR_LEVEL.lsSeedlings,
        kind: "group",
        code: "NUR-B",
        name: "Sprouts Room",
        capacity: 14,
        homeroomStaffProfileId: null,
      });
    });

    await waitFor(() => {
      expect(result.current.classGroups.data?.total).toBe(before + 1);
      expect(result.current.classGroups.data?.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "NUR-B", name: "Sprouts Room" })]),
      );
    });
  });
});
