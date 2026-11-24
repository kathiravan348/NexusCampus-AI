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

function seatPlan(id: string, key = crypto.randomUUID(), user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1/exam-papers/${id}/seat-plan`, {
    method: "POST",
    headers: {
      [MOCK_HEADER.tenant]: TENANT.littleSteps,
      [MOCK_HEADER.user]: user,
      "Idempotency-Key": key,
    },
  });
}

function setupPaper() {
  const tenantId = TENANT.littleSteps;
  const paper = mockDb.examPapers.find((row) => row.tenantId === tenantId)!;
  const exam = mockDb.exams.find((row) => row.id === paper.examId)!;
  exam.status = "scheduled";
  const offering = mockDb.subjectOfferings.find((row) => row.id === paper.subjectOfferingId)!;
  const rooms = mockDb.rooms.filter((row) => row.tenantId === tenantId);
  const first = rooms[0]!;
  const second = { ...first, id: crypto.randomUUID(), capacity: null };
  first.capacity = 1;
  mockDb.rooms.push(second);
  paper.roomIds = [first.id, second.id];
  const placement = mockDb.enrolments.find((row) => row.tenantId === tenantId)!;
  const template = {
    ...placement,
    classGroupId: offering.classGroupId,
    effectiveFrom: paper.date,
    effectiveTo: paper.date,
  };
  mockDb.enrolments = mockDb.enrolments.filter(
    (row) => row.tenantId !== tenantId || row.classGroupId !== offering.classGroupId,
  );
  mockDb.enrolments.push(
    { ...template, id: crypto.randomUUID(), learnerId: LEARNER.lsKavya, rollNumber: "10" },
    { ...template, id: crypto.randomUUID(), learnerId: LEARNER.lsRohan, rollNumber: "2" },
    { ...template, id: crypto.randomUUID(), learnerId: LEARNER.lsKavya, rollNumber: null },
  );
  return { paper, exam, first, second };
}

describe("M21 seating plan", () => {
  it("fills rooms in order and replays the original response without replacing seats again", async () => {
    const { paper, exam, first, second } = setupPaper();
    const key = crypto.randomUUID();
    const response = await seatPlan(paper.id, key);
    expect(response.status).toBe(200);
    const page = pageSchema(SeatAssignmentSchema).parse(await response.json());
    expect(page.items.map((s) => [s.roomId, s.seatLabel, s.learnerId])).toEqual([
      [first.id, "A1", LEARNER.lsRohan],
      [second.id, "B1", LEARNER.lsKavya],
    ]);
    expect(page.total).toBe(2);
    const newer = pageSchema(SeatAssignmentSchema).parse(await (await seatPlan(paper.id)).json());
    expect(newer.items[0]?.id).not.toBe(page.items[0]?.id);
    exam.status = "published";
    expect((await seatPlan(paper.id, key, USER.lsSunita)).status).toBe(403);
    const replay = await seatPlan(paper.id, key);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(page);
    expect(mockDb.seatAssignments.filter((row) => row.examPaperId === paper.id)).toEqual(
      newer.items,
    );
  });

  it("preserves the previous assignments on insufficient capacity or a closed exam", async () => {
    const { paper, exam, first } = setupPaper();
    const before = [...mockDb.seatAssignments];
    paper.roomIds = [first.id];
    const full = await seatPlan(paper.id);
    expect(full.status).toBe(400);
    expect(JSON.stringify(await full.json())).toContain('"path":"roomIds"');
    exam.status = "published";
    const closed = await seatPlan(paper.id);
    expect(closed.status).toBe(409);
    expect(JSON.stringify(await closed.json())).toContain('"path":"status"');
    expect(mockDb.seatAssignments).toEqual(before);
  });

  it("rejects a guardian, a foreign paper and an account without active staff membership", async () => {
    const { paper } = setupPaper();
    expect((await seatPlan(paper.id, crypto.randomUUID(), USER.lsSunita)).status).toBe(403);
    const foreign = mockDb.examPapers.find((row) => row.tenantId === TENANT.riverside)!;
    expect((await seatPlan(foreign.id)).status).toBe(404);
    mockDb.roleProfiles = mockDb.roleProfiles.filter((row) => row.kind !== "staff");
    expect((await seatPlan(paper.id)).status).toBe(403);
  });
});
