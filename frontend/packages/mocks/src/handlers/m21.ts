import {
  ExamPaperSchema,
  ExamSchema,
  HallTicketSchema,
  RevaluationRequestSchema,
  SeatAssignmentSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type ExamPaper,
  type SeatAssignment,
} from "@nexus/contracts";
import { HttpResponse, http } from "msw";
import { ApiFailure, entitled, failureResponse, ofTenant, readViewer } from "../context";
import { mockDb } from "../db";
import { applyScenario, readScenario } from "../scenarios";
import { familyLearnerIds, readLearnerFilter } from "./m18";
import { API_BASE, found, get, list } from "./route";

const M = { module: "M21" } as const;
const READ = "m21.exams.read";
const staff = { ...M, permission: READ };

const SeatPage = pageSchema(SeatAssignmentSchema);
const receipts = new Map<string, ReturnType<typeof SeatPage.parse>>();

function paperRoster(paper: ExamPaper) {
  const { tenantId, subjectOfferingId, date } = paper;
  const offering = found(
    ofTenant(mockDb.subjectOfferings, tenantId).find((row) => row.id === subjectOfferingId),
  );
  if (!offering.classGroupId) return [];
  const learners = new Set(ofTenant(mockDb.learners, tenantId).map((row) => row.id));
  const placements = ofTenant(mockDb.enrolments, tenantId)
    .filter(
      (row) =>
        learners.has(row.learnerId) &&
        row.classGroupId === offering.classGroupId &&
        row.effectiveFrom <= date &&
        (row.effectiveTo === null || row.effectiveTo >= date),
    )
    .sort(
      (a, b) =>
        Number(a.rollNumber === null) - Number(b.rollNumber === null) ||
        (a.rollNumber ?? "").localeCompare(b.rollNumber ?? "", "en", { numeric: true }) ||
        a.learnerId.localeCompare(b.learnerId),
    );
  return [...new Set(placements.map((row) => row.learnerId))];
}

/** Room index → A, B, …, Z, AA, AB, … (spreadsheet style). */
function roomLetters(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : roomLetters(Math.floor(index / 26) - 1) + letter;
}

function generatePlan(paper: ExamPaper) {
  const { tenantId } = paper;
  const roster = paperRoster(paper);
  const rooms = ofTenant(mockDb.rooms, tenantId);
  const seats: SeatAssignment[] = [];
  for (const [index, roomId] of paper.roomIds.entries()) {
    const room = rooms.find((row) => row.id === roomId);
    if (!room) {
      throw new ApiFailure("invalid_request", [{ path: "roomIds", message: "Invalid rooms" }]);
    }
    const group = roster.slice(seats.length, seats.length + (room.capacity ?? roster.length));
    for (const [position, learnerId] of group.entries()) {
      seats.push(
        SeatAssignmentSchema.parse({
          id: crypto.randomUUID(),
          tenantId,
          examPaperId: paper.id,
          learnerId,
          roomId,
          seatLabel: roomLetters(index) + (position + 1),
        }),
      );
    }
  }
  if (seats.length !== roster.length) {
    throw new ApiFailure("invalid_request", [
      { path: "roomIds", message: "Insufficient capacity" },
    ]);
  }
  const page = SeatPage.parse({
    items: seats.slice(0, PAGE_SIZE_MAX),
    page: 1,
    pageSize: PAGE_SIZE_MAX,
    total: seats.length,
  });
  mockDb.seatAssignments = [
    ...mockDb.seatAssignments.filter(
      (row) => row.tenantId !== tenantId || row.examPaperId !== paper.id,
    ),
    ...seats,
  ];
  return page;
}

export const m21Handlers = [
  http.post(`*${API_BASE}/exam-papers/:id/seat-plan`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      const { tenantId } = viewer;
      if (!entitled(tenantId, "M21")) throw new ApiFailure("module_disabled");
      const today = new Date().toISOString().slice(0, 10);
      const activeStaff = ofTenant(mockDb.roleProfiles, tenantId).some(
        (row) =>
          row.kind === "staff" &&
          row.personId === viewer.personId &&
          (!("status" in row) || row.status === "active") &&
          row.effectiveFrom <= today &&
          (row.effectiveTo === null || row.effectiveTo >= today),
      );
      if (!viewer.permissions.has("m21.exams.manage") || !activeStaff) {
        throw new ApiFailure("forbidden");
      }
      const paper = found(
        ofTenant(mockDb.examPapers, tenantId).find((row) => row.id === params["id"]),
      );
      const key = request.headers.get("Idempotency-Key");
      const receipt = key ? JSON.stringify([tenantId, key]) : null;
      const previous = receipt && receipts.get(receipt);
      if (previous) return HttpResponse.json(previous);
      const exam = found(ofTenant(mockDb.exams, tenantId).find((row) => row.id === paper.examId));
      if (exam.status !== "planned" && exam.status !== "scheduled") {
        throw new ApiFailure("conflict", [
          { path: "status", message: "Exam is closed for seating" },
        ]);
      }
      const page = generatePlan(paper);
      if (receipt) receipts.set(receipt, page);
      return HttpResponse.json(page);
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
  get("/exams", staff, (ctx) =>
    list(ctx, ofTenant(mockDb.exams, ctx.viewer.tenantId), pageSchema(ExamSchema)),
  ),
  get("/exams/:id/papers", staff, (ctx) => {
    const { tenantId } = ctx.viewer;
    const exam = found(ofTenant(mockDb.exams, tenantId).find((row) => row.id === ctx.params["id"]));
    const papers = ofTenant(mockDb.examPapers, tenantId).filter((row) => row.examId === exam.id);
    return list(ctx, papers, pageSchema(ExamPaperSchema));
  }),
  get("/exam-papers/:id/seats", staff, (ctx) => {
    const { tenantId } = ctx.viewer;
    const paper = found(
      ofTenant(mockDb.examPapers, tenantId).find((row) => row.id === ctx.params["id"]),
    );
    const seats = ofTenant(mockDb.seatAssignments, tenantId).filter(
      (row) => row.examPaperId === paper.id,
    );
    return list(ctx, seats, pageSchema(SeatAssignmentSchema));
  }),
  get("/hall-tickets", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const learnerId = readLearnerFilter(ctx, family);
    const tickets = ofTenant(mockDb.hallTickets, viewer.tenantId).filter(
      (row) =>
        (family === null || family.has(row.learnerId)) &&
        (learnerId === null || row.learnerId === learnerId),
    );
    return list(ctx, tickets, pageSchema(HallTicketSchema));
  }),
  get("/revaluation-requests", M, (ctx) => {
    const { viewer } = ctx;
    const family = viewer.permissions.has(READ) ? null : familyLearnerIds(viewer);
    const requests = ofTenant(mockDb.revaluationRequests, viewer.tenantId).filter(
      (row) => family === null || family.has(row.learnerId),
    );
    return list(ctx, requests, pageSchema(RevaluationRequestSchema));
  }),
];
