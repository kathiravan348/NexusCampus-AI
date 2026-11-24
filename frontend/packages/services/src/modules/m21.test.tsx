import { renderHook, waitFor } from "@testing-library/react";
import {
  useExamPapers,
  useExamSeats,
  useExams,
  useHallTickets,
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
});
