import {
  ExamPaperSchema,
  ExamSchema,
  HallTicketSchema,
  RevaluationRequestSchema,
  SeatAssignmentSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { LEARNER, TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

const papersPath = (id: string) => `/exams/${id}/papers`;
const seatsPath = (id: string) => `/exam-papers/${id}/seats`;

describe("M21 read handlers", () => {
  it("lists tenant-local records for admins", async () => {
    const examId = mockDb.exams.find((row) => row.tenantId === TENANT.littleSteps)!.id;
    const paperId = mockDb.examPapers.find((row) => row.examId === examId)!.id;
    const endpoints = [
      ["/exams", pageSchema(ExamSchema)],
      [papersPath(examId), pageSchema(ExamPaperSchema)],
      [seatsPath(paperId), pageSchema(SeatAssignmentSchema)],
      ["/hall-tickets", pageSchema(HallTicketSchema)],
      ["/revaluation-requests", pageSchema(RevaluationRequestSchema)],
    ] as const;
    for (const [path, schema] of endpoints) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const { items } = schema.parse(await response.json());
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    }
  });

  it("allows teachers to read exams and returns 404 for foreign exams and papers", async () => {
    expect((await get("/exams", USER.lsArjun)).status).toBe(200);
    const foreignExam = mockDb.exams.find((row) => row.tenantId === TENANT.riverside)!;
    const foreignPaper = mockDb.examPapers.find((row) => row.examId === foreignExam.id)!;
    expect((await get(papersPath(foreignExam.id))).status).toBe(404);
    expect((await get(seatsPath(foreignPaper.id))).status).toBe(404);
    expect((await get(`/hall-tickets?learnerId=${LEARNER.rvOliver}`)).status).toBe(404);
  });

  it("scopes hall tickets and revaluation requests to a guardian's learners", async () => {
    const ticket = mockDb.hallTickets.find((row) => row.tenantId === TENANT.littleSteps)!;
    const request = mockDb.revaluationRequests.find((row) => row.tenantId === TENANT.littleSteps)!;
    ticket.learnerId = LEARNER.lsRohan;
    request.learnerId = LEARNER.lsRohan;
    mockDb.hallTickets.push({ ...ticket, learnerId: LEARNER.lsKavya });
    mockDb.revaluationRequests.push({ ...request, learnerId: LEARNER.lsKavya });

    const tickets = await get(`/hall-tickets?learnerId=${LEARNER.lsRohan}`, USER.lsSunita);
    expect(tickets.status).toBe(200);
    const ticketItems = pageSchema(HallTicketSchema).parse(await tickets.json()).items;
    expect(ticketItems).toContainEqual(ticket);
    expect(ticketItems.every((row) => row.learnerId === LEARNER.lsRohan)).toBe(true);
    const requests = await get("/revaluation-requests", USER.lsSunita);
    expect(requests.status).toBe(200);
    const requestItems = pageSchema(RevaluationRequestSchema).parse(await requests.json()).items;
    expect(requestItems).toContainEqual(request);
    expect(requestItems.map((row) => row.learnerId)).not.toContain(LEARNER.lsKavya);
    expect((await get("/exams", USER.lsSunita)).status).toBe(403);
  });

  it("denies an account without the read permission or family access", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/exams")).status).toBe(403);
  });
});
