import { describe, expect, it } from "vitest";
import {
  ExamPaperSchema,
  ExamSchema,
  HallTicketSchema,
  RevaluationRequestSchema,
  SeatAssignmentSchema,
} from "./index";

const tenantId = "tenant-school";
const learnerId = "learner-01";
const timestamps = {
  createdAt: "2026-09-01T09:00:00Z",
  updatedAt: "2026-09-01T10:00:00Z",
};

const exam = {
  id: "exam-term-1",
  tenantId,
  institutionId: "institution-school",
  academicYearId: "year-2026",
  name: "First term exams",
  startsOn: "2026-09-21",
  endsOn: "2026-09-22",
  status: "scheduled",
  ...timestamps,
};

const paper = {
  id: "paper-maths",
  tenantId,
  examId: exam.id,
  subjectOfferingId: "offering-maths",
  date: exam.startsOn,
  start: "09:00",
  end: "11:00",
  roomIds: ["room-hall-1", "room-hall-2"],
  maxMarks: 80,
};

const seat = {
  id: "seat-maths-01",
  tenantId,
  examPaperId: paper.id,
  learnerId,
  roomId: "room-hall-1",
  seatLabel: "A12",
};

const revaluation = {
  id: "revaluation-maths-01",
  tenantId,
  examPaperId: paper.id,
  learnerId,
  reason: "Please review the mark for question four.",
  status: "changed",
  oldMarks: 62.5,
  newMarks: 64,
  createdAt: "2026-09-25T09:00:00Z",
  updatedAt: "2026-09-26T09:00:00Z",
};

describe("in-person exams", () => {
  it("accepts an exam with two papers, seating and a hall ticket", () => {
    const secondPaper = {
      ...paper,
      id: "paper-science",
      subjectOfferingId: "offering-science",
      date: exam.endsOn,
      roomIds: ["room-hall-2"],
    };
    const secondSeat = {
      ...seat,
      id: "seat-science-01",
      examPaperId: secondPaper.id,
      roomId: "room-hall-2",
    };
    const ticket = {
      id: "ticket-01",
      tenantId,
      examId: exam.id,
      learnerId,
      ticketNumber: "TERM-2026-001",
      issuedAt: "2026-09-16T09:00:00Z",
      revoked: false,
    };
    expect(ExamSchema.parse(exam)).toEqual(exam);
    expect(ExamPaperSchema.parse(paper)).toEqual(paper);
    expect(ExamPaperSchema.parse(secondPaper)).toEqual(secondPaper);
    expect(SeatAssignmentSchema.parse(seat)).toEqual(seat);
    expect(SeatAssignmentSchema.parse(secondSeat)).toEqual(secondSeat);
    expect(HallTicketSchema.parse(ticket)).toEqual(ticket);
  });

  it("rejects reverse dates, duplicate rooms and extra fields", () => {
    expect(ExamSchema.safeParse({ ...exam, endsOn: "2026-09-20" }).success).toBe(false);
    const roomIds = ["room-hall-1", "room-hall-1"];
    expect(ExamPaperSchema.safeParse({ ...paper, roomIds }).success).toBe(false);
    expect(SeatAssignmentSchema.safeParse({ ...seat, extra: true }).success).toBe(false);
  });

  it.each(["09:00", "08:59"])("rejects a paper ending at %s", (end) => {
    expect(ExamPaperSchema.safeParse({ ...paper, end }).success).toBe(false);
  });

  it("accepts a changed revaluation and a pending request without new marks", () => {
    const pending = { ...revaluation, status: "in_review", newMarks: null };
    expect(RevaluationRequestSchema.parse(revaluation)).toEqual(revaluation);
    expect(RevaluationRequestSchema.parse(pending)).toEqual(pending);
  });

  it("requires new marks exactly when a revaluation is changed", () => {
    const rejected = { ...revaluation, status: "rejected" };
    const missingMarks = { ...revaluation, newMarks: null };
    expect(RevaluationRequestSchema.safeParse(rejected).success).toBe(false);
    expect(RevaluationRequestSchema.safeParse(missingMarks).success).toBe(false);
  });

  it("rejects updates before creation", () => {
    const updatedAt = "2026-08-31T10:00:00Z";
    expect(ExamSchema.safeParse({ ...exam, updatedAt }).success).toBe(false);
    expect(RevaluationRequestSchema.safeParse({ ...revaluation, updatedAt }).success).toBe(false);
  });
});
