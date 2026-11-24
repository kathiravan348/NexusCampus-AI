import {
  ExamSchema,
  ExamPaperSchema,
  SeatAssignmentSchema,
  SubjectSchema,
  SubjectOfferingSchema,
  HallTicketSchema,
  RevaluationRequestSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { queryKeys } from "../keys";
import { idempotencyHeaders } from "../mutation";
import { useScopedQuery, useServices } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const ExamPage = pageSchema(ExamSchema);
const ExamPaperPage = pageSchema(ExamPaperSchema);
const SeatAssignmentPage = pageSchema(SeatAssignmentSchema);
const HallTicketPage = pageSchema(HallTicketSchema);
const SubjectPage = pageSchema(SubjectSchema);
const OfferingPage = pageSchema(SubjectOfferingSchema);
const RevaluationRequestPage = pageSchema(RevaluationRequestSchema);

export function useExams(enabled = true) {
  return useScopedQuery(
    queryKeys.m21.exams,
    (c, signal) => c.get("/exams", ExamPage, all, { signal }),
    enabled,
  );
}

function loadPapers(client: ApiClient, examId: string, signal: AbortSignal) {
  return client.get(`/exams/${encodeURIComponent(examId)}/papers`, ExamPaperPage, all, { signal });
}

// Re-evaluation requests reference papers directly. Share the schedule cache when
// resolving them for staff and subscribe only once per exam.
export function useExamTicketNames(staff: boolean, hasRequests: boolean) {
  const exams = useExams(staff);
  const resolvePapers = staff && hasRequests;
  const subjects = useScopedQuery(
    queryKeys.m15.subjects,
    (c, signal) => c.get("/subjects", SubjectPage, all, { signal }),
    resolvePapers,
  );
  const offerings = useScopedQuery(
    (s) => queryKeys.m15.subjectOfferings(s, null),
    (c, signal) => c.get("/subject-offerings", OfferingPage, all, { signal }),
    resolvePapers,
  );
  const examRows = staff && !exams.isError ? (exams.data?.items ?? []) : [];
  const examIds = resolvePapers ? examRows.map((exam) => exam.id) : [];

  const { client, scope } = useServices();
  const pages = useQueries({
    queries: scope
      ? examIds.map((id) => ({
          queryKey: queryKeys.m21.examPapers(scope, id),
          queryFn: ({ signal }: { signal: AbortSignal }) => loadPapers(client, id, signal),
        }))
      : [],
  });
  const subjectNames = new Map(
    subjects.isError ? [] : subjects.data?.items.map((row) => [row.id, row.name]),
  );
  const offeringNames = new Map(
    offerings.isError
      ? []
      : offerings.data?.items.map((row) => [row.id, subjectNames.get(row.subjectId)]),
  );
  const paperNames = new Map(
    pages.flatMap((page) =>
      page.isError
        ? []
        : (page.data?.items ?? []).map(
            (paper) => [paper.id, offeringNames.get(paper.subjectOfferingId)] as const,
          ),
    ),
  );
  return { examNames: new Map(examRows.map((row) => [row.id, row.name])), paperNames };
}

export function useExamPapers(examId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m21.examPapers(s, examId),
    (c, signal) => loadPapers(c, examId ?? "", signal),
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

/** Generates immediately while connected; a seating replacement is never queued. */
export function useGenerateSeatPlan(paperId: string | null) {
  const { client, scope } = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: async () => {
      if (!scope || !paperId || !navigator.onLine) throw new Error("Seat plan unavailable");
      const page = await client.send(
        "POST",
        `/exam-papers/${encodeURIComponent(paperId)}/seat-plan`,
        {},
        SeatAssignmentPage,
        { headers: idempotencyHeaders(crypto.randomUUID()) },
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.m21.examSeats(scope, paperId) });
      return page;
    },
  });
}
