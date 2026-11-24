import {
  ExamPaperSchema,
  ExamSchema,
  HallTicketSchema,
  RevaluationRequestSchema,
  SeatAssignmentSchema,
  pageSchema,
} from "@nexus/contracts";
import { ofTenant } from "../context";
import { mockDb } from "../db";
import { familyLearnerIds, readLearnerFilter } from "./m18";
import { found, get, list } from "./route";

const M = { module: "M21" } as const;
const READ = "m21.exams.read";
const staff = { ...M, permission: READ };

export const m21Handlers = [
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
