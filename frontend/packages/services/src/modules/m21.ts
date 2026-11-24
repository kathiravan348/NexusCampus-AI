import {
  ExamSchema,
  ExamPaperSchema,
  SeatAssignmentSchema,
  HallTicketSchema,
  RevaluationRequestSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const ExamPage = pageSchema(ExamSchema);
const ExamPaperPage = pageSchema(ExamPaperSchema);
const SeatAssignmentPage = pageSchema(SeatAssignmentSchema);
const HallTicketPage = pageSchema(HallTicketSchema);
const RevaluationRequestPage = pageSchema(RevaluationRequestSchema);

export function useExams() {
  return useScopedQuery(queryKeys.m21.exams, (c, signal) =>
    c.get("/exams", ExamPage, all, { signal }),
  );
}

export function useExamPapers(examId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m21.examPapers(s, examId),
    (c, signal) =>
      c.get(`/exams/${encodeURIComponent(examId ?? "")}/papers`, ExamPaperPage, all, { signal }),
    examId !== null,
  );
}

export function useExamSeats(paperId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m21.examSeats(s, paperId),
    (c, signal) =>
      c.get(`/exam-papers/${encodeURIComponent(paperId ?? "")}/seats`, SeatAssignmentPage, all, {
        signal,
      }),
    paperId !== null,
  );
}

export function useHallTickets(learnerId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m21.hallTickets(s, learnerId),
    (c, signal) => c.get("/hall-tickets", HallTicketPage, { ...all, learnerId }, { signal }),
  );
}

export function useRevaluationRequests() {
  return useScopedQuery(queryKeys.m21.revaluationRequests, (c, signal) =>
    c.get("/revaluation-requests", RevaluationRequestPage, all, { signal }),
  );
}
