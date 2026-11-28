import * as C from "@nexus/contracts";
import { describe, expect, it } from "vitest";
import * as F from "./index";

interface Row {
  tenantId: string;
  id?: string;
}
interface Parser {
  safeParse(value: unknown): { error?: unknown };
}

const SETS: [string, Parser, readonly Row[]][] = [
  ["ASSIGNMENTS", C.AssignmentSchema, F.ASSIGNMENTS],
  ["ASSIGNMENT_SUBMISSIONS", C.AssignmentSubmissionSchema, F.ASSIGNMENT_SUBMISSIONS],
  ["SUBMISSION_FEEDBACK", C.SubmissionFeedbackSchema, F.SUBMISSION_FEEDBACK],
  ["AI_MARKING_SUGGESTIONS", C.AiMarkingSuggestionSchema, F.AI_MARKING_SUGGESTIONS],
  ["PEER_REVIEWS", C.PeerReviewSchema, F.PEER_REVIEWS],
  ["ORIGINALITY_SIGNALS", C.OriginalitySignalSchema, F.ORIGINALITY_SIGNALS],
  ["QUESTION_BANKS", C.QuestionBankSchema, F.QUESTION_BANKS],
  ["QUESTION_ITEMS", C.QuestionItemSchema, F.QUESTION_ITEMS],
  ["ONLINE_TESTS", C.OnlineTestSchema, F.ONLINE_TESTS],
  ["TEST_ATTEMPTS", C.TestAttemptSchema, F.TEST_ATTEMPTS],
  ["TEST_RESPONSES", C.TestResponseSchema, F.TEST_RESPONSES],
  ["ITEM_STATISTICS", C.ItemStatisticSchema, F.ITEM_STATISTICS],
  ["MASTERY_RECORDS", C.MasteryRecordSchema, F.MASTERY_RECORDS],
  ["LEARNING_PATHS", C.LearningPathSchema, F.LEARNING_PATHS],
  ["TUTOR_SETTINGS", C.TutorSettingsSchema, F.TUTOR_SETTINGS],
  ["TUTOR_SESSIONS", C.TutorSessionSchema, F.TUTOR_SESSIONS],
  ["TUTOR_MESSAGES", C.TutorMessageSchema, F.TUTOR_MESSAGES],
  ["ENGAGEMENT_SNAPSHOTS", C.EngagementSnapshotSchema, F.ENGAGEMENT_SNAPSHOTS],
  ["RISK_SCORES", C.RiskScoreSchema, F.RISK_SCORES],
  ["INTERVENTIONS", C.InterventionSchema, F.INTERVENTIONS],
];

const T = F.TENANT;
const tenants = new Set(F.DEMO_TENANTS.map(({ tenantId }) => tenantId));
const staff = F.ROLE_PROFILES.filter(({ kind }) => kind === "staff");
const aiOn = new Set(F.AI_SETTINGS.filter((r) => r.enabled).map((r) => r.tenantId));
const byId = <T extends { id: string }>(rows: readonly T[], id: string | null) =>
  id === null ? undefined : rows.find((r) => r.id === id);

function hasAll<R, K extends keyof R>(
  rows: readonly R[],
  key: K,
  schema: { options: readonly R[K][] },
) {
  expect(new Set(rows.map((r) => r[key]))).toEqual(new Set(schema.options));
}

function has<R>(rows: readonly R[], fn: (row: R) => boolean) {
  expect(rows.some(fn)).toBe(true);
}

type RefRow = { id: string; tenantId: string };
const ref = (rows: readonly RefRow[], id: string | null, t: string) => {
  if (id !== null) expect(byId(rows, id)?.tenantId, id).toBe(t);
};
const refs = (rows: readonly RefRow[], ids: readonly string[], t: string) => {
  for (const id of ids) ref(rows, id, t);
};
const inCal = (t: string, d: string | null) => {
  if (d === null) return;
  const cal = F.ACADEMIC_CALENDARS.find((r) => r.tenantId === t);
  expect(d >= (cal?.startsOn ?? "") && d <= (cal?.endsOn ?? ""), d).toBe(true);
};

describe("Stage 4 M32, M33, M35 and M46 fixtures (NEX-221)", () => {
  it.each(SETS)("%s parse with their contract and have unique ids", (name, schema, rows) => {
    expect(rows.length, name).toBeGreaterThan(0);
    for (const row of rows) {
      expect(tenants.has(row.tenantId), `${name}:${row.tenantId}`).toBe(true);
      expect(schema.safeParse(row).error, row.id ?? name).toBeUndefined();
    }
    const ids = rows.map(({ id }) => id).filter((id): id is string => id !== undefined);
    if (ids.length > 0) expect(new Set(ids).size, name).toBe(rows.length);
  });

  it("resolve M32 assignments, submissions, marking, peer reviews, and originality", () => {
    expect(new Set(F.ASSIGNMENTS.map((r) => r.tenantId))).toEqual(tenants);
    hasAll(F.ASSIGNMENTS, "status", C.AssignmentStatusSchema);
    hasAll(F.ASSIGNMENT_SUBMISSIONS, "status", C.SubmissionStatusSchema);
    hasAll(F.AI_MARKING_SUGGESTIONS, "decision", C.AiSuggestionDecisionSchema);
    for (const a of F.ASSIGNMENTS) {
      ref(F.COURSE_SPACES, a.courseSpaceId, a.tenantId);
      ref(F.ASSESSMENTS, a.assessmentId, a.tenantId);
      ref(F.RUBRICS, a.rubricId, a.tenantId);
      ref(staff, a.createdByStaffProfileId, a.tenantId);
      refs(F.OUTCOMES, a.outcomeIds, a.tenantId);
      inCal(a.tenantId, a.openAt.slice(0, 10));
      inCal(a.tenantId, a.dueAt.slice(0, 10));
    }
    for (const s of F.ASSIGNMENT_SUBMISSIONS) {
      ref(F.ASSIGNMENTS, s.assignmentId, s.tenantId);
      ref(F.LEARNERS, s.learnerId, s.tenantId);
      refs(F.LEARNERS, s.groupLearnerIds, s.tenantId);
      if (s.submittedAt !== null) inCal(s.tenantId, s.submittedAt.slice(0, 10));
    }
    for (const fb of F.SUBMISSION_FEEDBACK) {
      const sub = byId(F.ASSIGNMENT_SUBMISSIONS, fb.submissionId);
      const asg = byId(F.ASSIGNMENTS, sub?.assignmentId ?? null);
      expect(sub?.tenantId, fb.id).toBe(fb.tenantId);
      ref(staff, fb.markedByStaffProfileId, fb.tenantId);
      if (fb.marks !== null && asg?.maxMarks !== null) {
        expect(fb.marks).toBeLessThanOrEqual(asg?.maxMarks ?? 0);
      }
      inCal(fb.tenantId, fb.markedAt.slice(0, 10));
    }
    for (const sug of F.AI_MARKING_SUGGESTIONS) {
      expect(aiOn.has(sug.tenantId), sug.id).toBe(true);
      ref(F.ASSIGNMENT_SUBMISSIONS, sug.submissionId, sug.tenantId);
      ref(staff, sug.decidedByStaffProfileId, sug.tenantId);
      const fb = F.SUBMISSION_FEEDBACK.find((r) => r.submissionId === sug.submissionId);
      if (sug.decision === "pending") expect(fb, sug.id).toBeUndefined();
      if (sug.decision === "edited" || sug.decision === "rejected") {
        expect(fb?.marks, sug.id).not.toBe(sug.suggestedMarks);
      }
      if (sug.decision === "accepted") {
        expect(fb?.markedByStaffProfileId).toBe(sug.decidedByStaffProfileId);
      }
    }
    has(F.ASSIGNMENTS, (r) => r.tenantId === T.riverside && Boolean(r.peerReview?.anonymous));
    has(F.ASSIGNMENTS, (r) => r.tenantId === T.northbridge && r.originalityCheck);
    for (const pr of F.PEER_REVIEWS) {
      const sub = byId(F.ASSIGNMENT_SUBMISSIONS, pr.submissionId);
      ref(F.ASSIGNMENTS, pr.assignmentId, pr.tenantId);
      expect(sub?.tenantId, pr.id).toBe(pr.tenantId);
      ref(F.LEARNERS, pr.reviewerLearnerId, pr.tenantId);
      expect(pr.reviewerLearnerId).not.toBe(sub?.learnerId);
      expect(sub?.groupLearnerIds).not.toContain(pr.reviewerLearnerId);
    }
    for (const sig of F.ORIGINALITY_SIGNALS) {
      ref(F.ASSIGNMENT_SUBMISSIONS, sig.submissionId, sig.tenantId);
      expect(sig.externalId).not.toBeNull();
    }
  });

  it("resolve M33 question banks, items, negative marking, tests, attempts, and stats", () => {
    hasAll(F.QUESTION_ITEMS, "kind", C.QuestionKindSchema);
    has(F.QUESTION_ITEMS, (r) => r.source === "ai_generated" && r.status === "in_review");
    has(F.QUESTION_ITEMS, (r) => r.tenantId === T.apex && r.negativePoints > 0);
    hasAll(F.ONLINE_TESTS, "mode", C.OnlineTestModeSchema);
    const isApexMock = (r: C.OnlineTest) =>
      r.tenantId === T.apex &&
      r.timeLimitMinutes !== null &&
      r.sections.length >= 2 &&
      r.sections.some((s) => s.pool !== null);
    has(F.ONLINE_TESTS, isApexMock);
    hasAll(F.TEST_ATTEMPTS, "status", C.TestAttemptStatusSchema);
    has(F.TEST_ATTEMPTS, (r) => r.tenantId === T.apex && (r.scorePoints ?? 0) < 0);
    has(F.TEST_RESPONSES, (r) => r.tenantId === T.apex && (r.autoScore ?? 0) < 0);
    for (const b of F.QUESTION_BANKS) {
      ref(F.INSTITUTIONS, b.institutionId, b.tenantId);
      refs(F.SUBJECTS, b.subjectIds, b.tenantId);
      refs(staff, b.editorStaffProfileIds, b.tenantId);
    }
    for (const q of F.QUESTION_ITEMS) {
      ref(F.QUESTION_BANKS, q.bankId, q.tenantId);
      ref(staff, q.createdByProfileId, q.tenantId);
      refs(F.OUTCOMES, q.outcomeIds, q.tenantId);
    }
    for (const t of F.ONLINE_TESTS) {
      ref(F.COURSE_SPACES, t.courseSpaceId, t.tenantId);
      ref(F.ASSESSMENTS, t.assessmentId, t.tenantId);
      inCal(t.tenantId, t.opensAt.slice(0, 10));
      inCal(t.tenantId, t.closesAt.slice(0, 10));
      const approved = { tenantId: t.tenantId, status: "approved" };
      for (const sec of t.sections) {
        for (const iid of sec.itemIds) {
          expect(byId(F.QUESTION_ITEMS, iid), iid).toMatchObject(approved);
        }
        refs(F.QUESTION_BANKS, sec.pool?.bankIds ?? [], t.tenantId);
        refs(F.OUTCOMES, sec.pool?.outcomeIds ?? [], t.tenantId);
      }
    }
    for (const a of F.TEST_ATTEMPTS) {
      ref(F.ONLINE_TESTS, a.testId, a.tenantId);
      ref(F.LEARNERS, a.learnerId, a.tenantId);
      inCal(a.tenantId, a.startedAt.slice(0, 10));
      if (a.scorePoints !== null) {
        const resps = F.TEST_RESPONSES.filter((r) => r.attemptId === a.id);
        const sum = resps.reduce((acc, r) => acc + (r.manualScore ?? r.autoScore ?? 0), 0);
        expect(sum, a.id).toBe(a.scorePoints);
      }
    }
    for (const r of F.TEST_RESPONSES) {
      ref(F.TEST_ATTEMPTS, r.attemptId, r.tenantId);
      ref(F.QUESTION_ITEMS, r.itemId, r.tenantId);
      ref(staff, r.markedByStaffProfileId, r.tenantId);
    }
    for (const st of F.ITEM_STATISTICS) {
      const item = byId(F.QUESTION_ITEMS, st.itemId);
      expect(item?.tenantId, st.itemId).toBe(st.tenantId);
      ref(F.ONLINE_TESTS, st.testId, st.tenantId);
      const optIds = new Set(item?.options.map((o) => o.id));
      for (const key of Object.keys(st.optionCounts)) expect(optIds.has(key), key).toBe(true);
    }
  });

  it("resolve M35 mastery, paths, tutor settings, sessions, and safety checks", () => {
    hasAll(F.MASTERY_RECORDS, "level", C.MasteryLevelSchema);
    expect(new Set(F.TUTOR_SETTINGS.map((r) => r.tenantId))).toEqual(tenants);
    expect(F.TUTOR_SETTINGS.find((r) => r.tenantId === T.littleSteps)?.enabled).toBe(false);
    const steps = F.LEARNING_PATHS.flatMap((p) => p.steps);
    hasAll(steps, "kind", C.LearningPathStepKindSchema);
    hasAll(steps, "status", C.LearningPathStepStatusSchema);
    for (const m of F.MASTERY_RECORDS) {
      ref(F.LEARNERS, m.learnerId, m.tenantId);
      ref(F.OUTCOMES, m.outcomeId, m.tenantId);
    }
    for (const p of F.LEARNING_PATHS) {
      ref(F.LEARNERS, p.learnerId, p.tenantId);
      ref(F.COURSE_SPACES, p.courseSpaceId, p.tenantId);
      ref(staff, p.assignedByStaffProfileId, p.tenantId);
      for (const s of p.steps) {
        ref(F.OUTCOMES, s.outcomeId, p.tenantId);
        if (s.kind === "content") ref(F.CONTENT_ITEMS, s.refId, p.tenantId);
        if (s.kind === "assignment") ref(F.ASSIGNMENTS, s.refId, p.tenantId);
        if (s.kind === "test" || s.kind === "practice") ref(F.ONLINE_TESTS, s.refId, p.tenantId);
        if (s.kind === "live_session") ref(F.LIVE_SESSIONS, s.refId, p.tenantId);
      }
    }
    for (const ts of F.TUTOR_SETTINGS) {
      ref(F.COURSE_SPACES, ts.courseSpaceId, ts.tenantId);
      ref(staff, ts.updatedByStaffProfileId, ts.tenantId);
      refs(F.CONTENT_ITEMS, ts.sourceContentIds, ts.tenantId);
    }
    for (const ses of F.TUTOR_SESSIONS) {
      expect(aiOn.has(ses.tenantId), ses.id).toBe(true);
      const learner = byId(F.LEARNERS, ses.learnerId);
      const person = byId(F.PEOPLE, learner?.personId ?? null);
      expect(learner?.tenantId, ses.id).toBe(ses.tenantId);
      ref(F.COURSE_SPACES, ses.courseSpaceId, ses.tenantId);
      expect(ses.learnerIsMinor, ses.id).toBe(person?.isMinor);
      if (ses.learnerIsMinor) {
        const expected = {
          tenantId: ses.tenantId,
          personId: person?.id,
          purpose: "ai_features",
          status: "granted",
        };
        expect(byId(F.CONSENTS, ses.consentId), ses.id).toMatchObject(expected);
      }
      const msgCount = F.TUTOR_MESSAGES.filter((m) => m.sessionId === ses.id).length;
      expect(msgCount, ses.id).toBe(ses.messageCount);
    }
    for (const msg of F.TUTOR_MESSAGES) {
      ref(F.TUTOR_SESSIONS, msg.sessionId, msg.tenantId);
      if (msg.role === "tutor") {
        expect(msg.aiGenerated).toBe(true);
        for (const src of msg.sources) {
          if (src.recordType === "contentItem") ref(F.CONTENT_ITEMS, src.recordId, msg.tenantId);
          if (src.recordType === "outcome") ref(F.OUTCOMES, src.recordId, msg.tenantId);
        }
      }
    }
    has(F.TUTOR_MESSAGES, (m) => m.role === "tutor" && m.blocked && m.safetyCategory !== null);
  });

  it("resolve M46 engagement, risk scores, and interventions without Little Steps", () => {
    for (const r of [...F.ENGAGEMENT_SNAPSHOTS, ...F.RISK_SCORES, ...F.INTERVENTIONS]) {
      expect(r.tenantId).not.toBe(T.littleSteps);
    }
    hasAll(F.RISK_SCORES, "level", C.RiskLevelSchema);
    hasAll(F.RISK_SCORES, "status", C.RiskReviewStatusSchema);
    expect(F.RISK_SCORES.every((r) => r.factors.length >= 2)).toBe(true);
    has(F.RISK_SCORES, (r) => Date.parse(r.validUntil) < Date.parse(F.DEMO_NOW));
    hasAll(F.INTERVENTIONS, "status", C.InterventionStatusSchema);
    for (const snap of F.ENGAGEMENT_SNAPSHOTS) {
      ref(F.LEARNERS, snap.learnerId, snap.tenantId);
      ref(F.COURSE_SPACES, snap.courseSpaceId, snap.tenantId);
      inCal(snap.tenantId, snap.periodStart);
      inCal(snap.tenantId, snap.periodEnd);
    }
    for (const rs of F.RISK_SCORES) {
      expect(aiOn.has(rs.tenantId), rs.id).toBe(true);
      ref(F.LEARNERS, rs.learnerId, rs.tenantId);
      ref(staff, rs.reviewedByStaffProfileId, rs.tenantId);
      inCal(rs.tenantId, rs.computedAt.slice(0, 10));
    }
    for (const itv of F.INTERVENTIONS) {
      ref(F.LEARNERS, itv.learnerId, itv.tenantId);
      ref(F.RISK_SCORES, itv.riskScoreId, itv.tenantId);
      ref(staff, itv.ownerStaffProfileId, itv.tenantId);
      ref(staff, itv.createdByStaffProfileId, itv.tenantId);
      inCal(itv.tenantId, itv.startOn);
    }
  });
});
