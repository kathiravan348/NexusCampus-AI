import { ASSESSMENT, CLASS_GROUP, mockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useAssessmentMarks,
  useAssessmentRoster,
  useAssessments,
  useGradingSchemes,
  useRubrics,
  useSaveMarkEntry,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M20 hooks", () => {
  it("loads and parses all module pages including assessment roster", async () => {
    signInAs(ADMIN);
    const assessmentId = ASSESSMENT.ls[0];
    const { result } = renderHook(
      () => ({
        schemes: useGradingSchemes(),
        assessments: useAssessments(CLASS_GROUP.lsSeedlings),
        rubrics: useRubrics(),
        roster: useAssessmentRoster(assessmentId),
        marks: useAssessmentMarks(assessmentId),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.schemes.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.assessments.data?.items).toMatchObject([{ id: assessmentId }]);
      expect(result.current.rubrics.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(result.current.roster.data?.items.length).toBeGreaterThan(0);
      expect(result.current.marks.data?.items[0]?.assessmentId).toBe(assessmentId);
    });
  });

  it("replays a queued mark entry once into its original assessment after switching", async () => {
    signInAs(ADMIN);
    const id: string = ASSESSMENT.ls[1];
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      const { result, rerender } = renderHook(
        ({ selected }) => ({
          roster: useAssessmentRoster(id),
          marks: useAssessmentMarks(id),
          write: useSaveMarkEntry(selected),
        }),
        { initialProps: { selected: id }, wrapper: wrapper({ db: freshDb() }) },
      );

      await waitFor(() => expect(result.current.roster.data?.items.length).toBeGreaterThan(0));
      await waitFor(() => expect(result.current.marks.isSuccess).toBe(true));

      const learnerId = result.current.roster.data!.items[0]!.learnerId;
      const existing = mockDb.markEntries.find(
        (row) => row.assessmentId === id && row.learnerId === learnerId,
      );
      const countBefore = mockDb.markEntries.filter((row) => row.assessmentId === id).length;
      const input = { marks: 46.5, absent: false, rubricScores: null, remark: null };

      online.mockReturnValue(false);
      await act(async () => {
        expect((await result.current.write.saveMark(learnerId, input)).queued).toBe(true);
      });
      await waitFor(() => expect(result.current.write.pendingEntries).toHaveLength(1));
      expect(
        mockDb.markEntries.find((row) => row.assessmentId === id && row.learnerId === learnerId)
          ?.marks,
      ).not.toBe(input.marks);

      rerender({ selected: ASSESSMENT.ls[0] });
      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() =>
        expect(
          result.current.marks.data?.items.find((row) => row.learnerId === learnerId),
        ).toMatchObject({ ...input, assessmentId: id }),
      );
      const stored = mockDb.markEntries.filter(
        (row) => row.assessmentId === id && row.learnerId === learnerId,
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        ...input,
        ...(existing ? { id: existing.id } : {}),
      });
      expect(mockDb.markEntries.filter((row) => row.assessmentId === id)).toHaveLength(
        existing ? countBefore : countBefore + 1,
      );

      rerender({ selected: id });
      await waitFor(() => expect(result.current.write.pendingEntries).toHaveLength(0));
    } finally {
      online.mockRestore();
    }
  });
});
