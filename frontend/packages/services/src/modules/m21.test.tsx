import { mockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useExamPapers,
  useExamSeats,
  useExams,
  useHallTickets,
  useGenerateSeatPlan,
  useRevaluationRequests,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M21 hooks", () => {
  it("loads and parses all module pages", async () => {
    signInAs(ADMIN);
    const { result } = renderHook(
      () => {
        const exams = useExams();
        const examId = exams.data?.items[0]?.id ?? null;
        const papers = useExamPapers(examId);
        const paperId = papers.data?.items[0]?.id ?? null;
        return {
          exams,
          examId,
          papers,
          paperId,
          seats: useExamSeats(paperId),
          tickets: useHallTickets(),
          requests: useRevaluationRequests(),
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { exams, examId, papers, paperId, seats, tickets, requests } = result.current;
      expect(exams.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(examId).not.toBeNull();
      expect(papers.data?.items[0]?.examId).toBe(examId);
      expect(paperId).not.toBeNull();
      expect(seats.data?.items[0]?.examPaperId).toBe(paperId);
      expect(tickets.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
      expect(requests.data?.items[0]?.tenantId).toBe(ADMIN.tenantId);
    });
  });
  it("refreshes the selected paper after generation", async () => {
    signInAs(ADMIN);
    const paper = mockDb.examPapers.find((row) => row.tenantId === ADMIN.tenantId)!;
    const exam = mockDb.exams.find((row) => row.id === paper.examId)!;
    exam.status = "planned";
    const room = mockDb.rooms.find((row) => row.tenantId === ADMIN.tenantId)!;
    room.capacity = null;
    paper.roomIds = [room.id];
    const { result } = renderHook(
      () => ({ seats: useExamSeats(paper.id), plan: useGenerateSeatPlan(paper.id) }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.seats.isSuccess).toBe(true));
    const original = result.current.seats.data;
    await act(async () => {
      await result.current.plan.mutateAsync();
    });
    await waitFor(() => {
      expect(result.current.plan.isSuccess).toBe(true);
      expect(result.current.seats.data).toEqual(result.current.plan.data);
      expect(result.current.seats.data).not.toEqual(original);
    });
  });
});
