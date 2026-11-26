import { describe, expect, it } from "vitest";
import {
  LearningPathSchema,
  MasteryRecordSchema,
  TutorMessageSchema,
  TutorSessionSchema,
  TutorSettingsSchema,
  type LearningPath,
  type MasteryLevel,
  type MasteryRecord,
  type TutorAudience,
  type TutorMessage,
  type TutorMode,
  type TutorSession,
  type TutorSettings,
} from "./index";

const mastery: MasteryRecord = {
  tenantId: "tenant-school",
  learnerId: "learner-aarav",
  outcomeId: "outcome-number-a1",
  level: "developing",
  scoreBps: 5800,
  evidenceCount: 4,
  lastEvidenceAt: "2026-07-02T09:12:00Z",
  updatedAt: "2026-07-02T09:13:00Z",
};
const teacherPath: LearningPath = {
  id: "path-aarav-fractions",
  tenantId: "tenant-school",
  learnerId: "learner-aarav",
  courseSpaceId: "space-5a-maths",
  source: "teacher",
  assignedByStaffProfileId: "staff-maths",
  status: "active",
  steps: [
    {
      id: "step-1",
      order: 1,
      kind: "content",
      refId: "content-fraction-strips",
      outcomeId: "outcome-number-a1",
      status: "done",
      reason: "Revisit folding strips before the practice set.",
    },
    {
      id: "step-2",
      order: 2,
      kind: "practice",
      refId: "test-fractions-practice",
      outcomeId: "outcome-number-a1",
      status: "available",
      reason: "Three of the last five fraction answers were wrong.",
    },
  ],
  createdAt: "2026-07-03T08:00:00Z",
  updatedAt: "2026-07-03T09:00:00Z",
};
const settings: TutorSettings = {
  tenantId: "tenant-school",
  courseSpaceId: "space-5a-maths",
  enabled: true,
  mode: "hints_only",
  audience: "children",
  sourceContentIds: ["content-fraction-strips"],
  dailyMessageLimit: 30,
  transcriptsVisibleToStaff: true,
  updatedByStaffProfileId: "staff-maths",
  updatedAt: "2026-07-01T08:00:00Z",
};
const minorSession: TutorSession = {
  id: "tutor-session-1",
  tenantId: "tenant-school",
  learnerId: "learner-aarav",
  courseSpaceId: "space-5a-maths",
  learnerIsMinor: true,
  consentId: "consent-aarav-ai",
  status: "closed",
  startedAt: "2026-07-04T15:00:00Z",
  endedAt: "2026-07-04T15:20:00Z",
  messageCount: 6,
  transcriptsVisibleToStaff: true,
  flaggedForReview: false,
};
const learnerMessage: TutorMessage = {
  id: "message-1",
  tenantId: "tenant-school",
  sessionId: minorSession.id,
  role: "learner",
  text: "Why is 2/4 the same as 1/2?",
  createdAt: "2026-07-04T15:01:00Z",
};
const answer: TutorMessage = {
  id: "message-2",
  tenantId: "tenant-school",
  sessionId: minorSession.id,
  role: "tutor",
  text: "Try folding a strip into four parts. How many parts cover the same length as one half?",
  aiGenerated: true,
  tier: "fast",
  sources: [
    {
      moduleId: "M31",
      recordType: "contentItem",
      recordId: "content-fraction-strips",
      label: "Fraction strips",
    },
  ],
  locale: "en-IN",
  blocked: false,
  safetyCategory: null,
  feedback: "helpful",
  createdAt: "2026-07-04T15:01:05Z",
};

describe("mastery", () => {
  it("accepts each level", () => {
    const levels: MasteryLevel[] = ["emerging", "developing", "secure", "mastered"];
    for (const level of levels) {
      expect(MasteryRecordSchema.safeParse({ ...mastery, level }).success).toBe(true);
    }
    const fresh = {
      ...mastery,
      level: "not_started",
      scoreBps: 0,
      evidenceCount: 0,
      lastEvidenceAt: null,
    };
    expect(MasteryRecordSchema.safeParse(fresh).success).toBe(true);
  });

  it("rejects inconsistent evidence", () => {
    expect(MasteryRecordSchema.safeParse({ ...mastery, level: "not_started" }).success).toBe(false);
    const levelWithoutEvidence = {
      ...mastery,
      evidenceCount: 0,
      scoreBps: 0,
      lastEvidenceAt: null,
    };
    expect(MasteryRecordSchema.safeParse(levelWithoutEvidence).success).toBe(false);
    const scoreWithoutEvidence = {
      ...mastery,
      level: "not_started",
      evidenceCount: 0,
      lastEvidenceAt: null,
    };
    expect(MasteryRecordSchema.safeParse(scoreWithoutEvidence).success).toBe(false);
    expect(MasteryRecordSchema.safeParse({ ...mastery, lastEvidenceAt: null }).success).toBe(false);
    expect(MasteryRecordSchema.safeParse({ ...mastery, scoreBps: 10001 }).success).toBe(false);
  });
});

describe("learning paths", () => {
  it("accepts a teacher path and an adaptive path", () => {
    expect(LearningPathSchema.safeParse(teacherPath).success).toBe(true);
    const adaptive = { ...teacherPath, source: "adaptive", assignedByStaffProfileId: null };
    expect(LearningPathSchema.safeParse(adaptive).success).toBe(true);
  });

  it("rejects bad paths", () => {
    const [first, second] = teacherPath.steps;
    expect(
      LearningPathSchema.safeParse({ ...teacherPath, steps: [first, { ...second, order: 1 }] })
        .success,
    ).toBe(false);
    expect(
      LearningPathSchema.safeParse({ ...teacherPath, steps: [first, { ...second, id: "step-1" }] })
        .success,
    ).toBe(false);
    expect(
      LearningPathSchema.safeParse({ ...teacherPath, assignedByStaffProfileId: null }).success,
    ).toBe(false);
    expect(LearningPathSchema.safeParse({ ...teacherPath, source: "adaptive" }).success).toBe(
      false,
    );
    expect(LearningPathSchema.safeParse({ ...teacherPath, steps: [] }).success).toBe(false);
    expect(
      LearningPathSchema.safeParse({ ...teacherPath, steps: [{ ...first, reason: " " }] }).success,
    ).toBe(false);
  });
});

describe("tutor settings and sessions", () => {
  it("accepts each mode and audience", () => {
    const modes: TutorMode[] = ["hints_only", "explain", "socratic"];
    const audiences: TutorAudience[] = ["children", "teens", "adults"];
    for (const mode of modes) {
      for (const audience of audiences) {
        expect(TutorSettingsSchema.safeParse({ ...settings, mode, audience }).success).toBe(true);
      }
    }
  });

  it("rejects bad settings", () => {
    expect(TutorSettingsSchema.safeParse({ ...settings, dailyMessageLimit: 0 }).success).toBe(
      false,
    );
    expect(
      TutorSettingsSchema.safeParse({ ...settings, sourceContentIds: ["c", "c"] }).success,
    ).toBe(false);
    expect(TutorSettingsSchema.safeParse({ ...settings, audience: "toddlers" }).success).toBe(
      false,
    );
  });

  it("accepts a minor's session with consent and an adult's open session without", () => {
    expect(TutorSessionSchema.safeParse(minorSession).success).toBe(true);
    const adult = {
      ...minorSession,
      learnerIsMinor: false,
      consentId: null,
      status: "open",
      endedAt: null,
    };
    expect(TutorSessionSchema.safeParse(adult).success).toBe(true);
  });

  it("rejects a minor without consent and bad end times", () => {
    expect(TutorSessionSchema.safeParse({ ...minorSession, consentId: null }).success).toBe(false);
    const { transcriptsVisibleToStaff: _shown, ...withoutSnapshot } = minorSession;
    expect(_shown).toBe(true);
    expect(TutorSessionSchema.safeParse(withoutSnapshot).success).toBe(false);
    expect(TutorSessionSchema.safeParse({ ...minorSession, status: "open" }).success).toBe(false);
    expect(TutorSessionSchema.safeParse({ ...minorSession, endedAt: null }).success).toBe(false);
    expect(
      TutorSessionSchema.safeParse({ ...minorSession, endedAt: "2026-07-04T14:00:00Z" }).success,
    ).toBe(false);
  });
});

describe("tutor messages", () => {
  it("accepts a learner message, a cited answer and a blocked answer", () => {
    expect(TutorMessageSchema.safeParse(learnerMessage).success).toBe(true);
    expect(TutorMessageSchema.safeParse(answer).success).toBe(true);
    const blocked = {
      ...answer,
      text: "Let's talk to a teacher you trust about this.",
      sources: [],
      blocked: true,
      safetyCategory: "self_harm",
      feedback: null,
    };
    expect(TutorMessageSchema.safeParse(blocked).success).toBe(true);
  });

  it("rejects unlabelled, uncited or inconsistent answers", () => {
    expect(TutorMessageSchema.safeParse({ ...answer, sources: [] }).success).toBe(false);
    expect(TutorMessageSchema.safeParse({ ...answer, aiGenerated: false }).success).toBe(false);
    expect(TutorMessageSchema.safeParse({ ...answer, blocked: true }).success).toBe(false);
    expect(TutorMessageSchema.safeParse({ ...answer, safetyCategory: "off_topic" }).success).toBe(
      false,
    );
    expect(TutorMessageSchema.safeParse({ ...learnerMessage, aiGenerated: true }).success).toBe(
      false,
    );
    expect(TutorMessageSchema.safeParse({ ...learnerMessage, text: "" }).success).toBe(false);
  });
});
