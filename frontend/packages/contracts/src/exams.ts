import { z } from "zod";
import { IdSchema, IsoDateSchema, NameSchema, UtcDateTimeSchema } from "./common";
import { TimeOfDaySchema } from "./notification";

const timestamps = { createdAt: UtcDateTimeSchema, updatedAt: UtcDateTimeSchema };
const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

export const ExamStatusSchema = z.enum([
  "planned",
  "scheduled",
  "running",
  "results_pending",
  "published",
]);
export type ExamStatus = z.infer<typeof ExamStatusSchema>;

export const ExamSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    academicYearId: IdSchema,
    name: NameSchema,
    startsOn: IsoDateSchema,
    endsOn: IsoDateSchema,
    status: ExamStatusSchema,
    ...timestamps,
  })
  .refine((exam) => exam.endsOn >= exam.startsOn, {
    message: "endsOn is before startsOn",
    path: ["endsOn"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Exam = z.infer<typeof ExamSchema>;

export const ExamPaperSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    examId: IdSchema,
    subjectOfferingId: IdSchema,
    date: IsoDateSchema,
    start: TimeOfDaySchema,
    end: TimeOfDaySchema,
    roomIds: z.array(IdSchema).max(20),
    maxMarks: z.number().min(1).max(1000).multipleOf(0.5),
  })
  .refine((paper) => paper.end > paper.start, {
    message: "end must be after start",
    path: ["end"],
  })
  .refine((paper) => new Set(paper.roomIds).size === paper.roomIds.length, {
    message: "roomIds has duplicates",
    path: ["roomIds"],
  });
export type ExamPaper = z.infer<typeof ExamPaperSchema>;

export const SeatAssignmentSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  examPaperId: IdSchema,
  learnerId: IdSchema,
  roomId: IdSchema,
  seatLabel: z.string().trim().min(1).max(10),
});
export type SeatAssignment = z.infer<typeof SeatAssignmentSchema>;

export const HallTicketSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  examId: IdSchema,
  learnerId: IdSchema,
  ticketNumber: z.string().trim().min(1).max(40),
  issuedAt: UtcDateTimeSchema,
  revoked: z.boolean(),
});
export type HallTicket = z.infer<typeof HallTicketSchema>;

export const RevaluationRequestStatusSchema = z.enum([
  "requested",
  "in_review",
  "changed",
  "unchanged",
  "rejected",
]);
export type RevaluationRequestStatus = z.infer<typeof RevaluationRequestStatusSchema>;

const ExamMarksSchema = z.number().min(0).multipleOf(0.5);

export const RevaluationRequestSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    examPaperId: IdSchema,
    learnerId: IdSchema,
    /** Personal data (V-7); keep out of logs. */
    reason: z.string().max(300),
    status: RevaluationRequestStatusSchema,
    oldMarks: ExamMarksSchema,
    newMarks: ExamMarksSchema.nullable(),
    ...timestamps,
  })
  .refine((request) => (request.status === "changed") === (request.newMarks !== null), {
    message: "newMarks is set exactly when status is changed",
    path: ["newMarks"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type RevaluationRequest = z.infer<typeof RevaluationRequestSchema>;
