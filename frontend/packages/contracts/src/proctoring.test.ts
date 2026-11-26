import { describe, expect, it } from "vitest";
import {
  ProctoringFlagSchema,
  ProctoringSessionSchema,
  ProctoringSettingsSchema,
  RecordingSegmentSchema,
  type IdentityCheckMode,
  type ProctoringFlag,
  type ProctoringFlagReview,
  type ProctoringSession,
  type ProctoringSettings,
  type RecordingMode,
  type RecordingSegment,
} from "./index";

const settings: ProctoringSettings = {
  tenantId: "tenant-coaching",
  testId: "test-jee-mock-4",
  provider: "demo",
  identityCheck: "staff_photo_match",
  browserLock: true,
  recording: "screen_and_camera",
  retentionDays: 30,
  aiFlagging: true,
  noticeVersion: "2026-07",
  updatedByStaffProfileId: "staff-exam-lead",
  updatedAt: "2026-07-01T08:00:00Z",
};
const session: ProctoringSession = {
  id: "proctoring-1",
  tenantId: "tenant-coaching",
  testId: settings.testId,
  attemptId: "attempt-priya-1",
  learnerId: "learner-priya",
  status: "ended",
  noticeVersion: settings.noticeVersion,
  noticeAcceptedAt: "2026-07-20T04:28:00Z",
  identityResult: "verified",
  identityCheckedByStaffProfileId: "staff-invigilator",
  identityCheckedAt: "2026-07-20T04:29:00Z",
  startedAt: "2026-07-20T04:30:00Z",
  endedAt: "2026-07-20T07:30:00Z",
};
const segment: RecordingSegment = {
  id: "segment-1",
  tenantId: "tenant-coaching",
  sessionId: session.id,
  kind: "screen",
  startedAt: "2026-07-20T04:30:00Z",
  endedAt: "2026-07-20T05:30:00Z",
  sizeBytes: 450_000_000,
  deleteOn: "2026-08-19",
};
const aiFlag: ProctoringFlag = {
  id: "flag-1",
  tenantId: "tenant-coaching",
  sessionId: session.id,
  kind: "another_person_visible",
  source: "ai",
  aiGenerated: true,
  confidenceBps: 8100,
  reason: "A second person was in view for about 40 seconds.",
  occurredAt: "2026-07-20T05:10:00Z",
  offsetSeconds: 2400,
  review: "pending",
  reviewedByStaffProfileId: null,
  reviewedAt: null,
  reviewNote: null,
};
const reviewed = {
  reviewedByStaffProfileId: "staff-exam-lead",
  reviewedAt: "2026-07-20T10:00:00Z",
};

describe("proctoring settings", () => {
  it("accepts each identity mode and recording mode", () => {
    const identities: IdentityCheckMode[] = ["none", "staff_photo_match", "id_document_view"];
    const recordings: RecordingMode[] = ["screen", "screen_and_camera"];
    for (const identityCheck of identities) {
      for (const recording of recordings) {
        expect(
          ProctoringSettingsSchema.safeParse({ ...settings, identityCheck, recording }).success,
        ).toBe(true);
      }
      const unrecorded = {
        ...settings,
        identityCheck,
        recording: "none",
        retentionDays: null,
        aiFlagging: false,
      };
      expect(ProctoringSettingsSchema.safeParse(unrecorded).success).toBe(true);
    }
  });

  it("ties retention to recording and refuses secrets", () => {
    expect(ProctoringSettingsSchema.safeParse({ ...settings, recording: "none" }).success).toBe(
      false,
    );
    expect(ProctoringSettingsSchema.safeParse({ ...settings, retentionDays: null }).success).toBe(
      false,
    );
    expect(ProctoringSettingsSchema.safeParse({ ...settings, retentionDays: 366 }).success).toBe(
      false,
    );
    const aiWithoutRecording = {
      ...settings,
      recording: "none",
      retentionDays: null,
      aiFlagging: true,
    };
    expect(ProctoringSettingsSchema.safeParse(aiWithoutRecording).success).toBe(false);
    expect(
      ProctoringSettingsSchema.safeParse({ ...settings, provider: "Demo Provider" }).success,
    ).toBe(false);
    expect(ProctoringSettingsSchema.safeParse({ ...settings, apiKey: "secret" }).success).toBe(
      false,
    );
  });
});

describe("proctoring sessions", () => {
  it("accepts a session in each status and identity result", () => {
    const waiting = {
      ...session,
      status: "waiting",
      noticeAcceptedAt: null,
      identityResult: "pending",
      identityCheckedByStaffProfileId: null,
      identityCheckedAt: null,
      startedAt: null,
      endedAt: null,
    };
    expect(ProctoringSessionSchema.safeParse(waiting).success).toBe(true);
    expect(
      ProctoringSessionSchema.safeParse({ ...session, status: "in_progress", endedAt: null })
        .success,
    ).toBe(true);
    expect(ProctoringSessionSchema.safeParse(session).success).toBe(true);
    expect(
      ProctoringSessionSchema.safeParse({ ...session, identityResult: "not_verified" }).success,
    ).toBe(true);
    const notRequired = {
      ...session,
      identityResult: "not_required",
      identityCheckedByStaffProfileId: null,
      identityCheckedAt: null,
    };
    expect(ProctoringSessionSchema.safeParse(notRequired).success).toBe(true);
  });

  it("rejects starts without notice, unattended identity decisions and bad times", () => {
    expect(ProctoringSessionSchema.safeParse({ ...session, noticeAcceptedAt: null }).success).toBe(
      false,
    );
    expect(
      ProctoringSessionSchema.safeParse({ ...session, identityCheckedByStaffProfileId: null })
        .success,
    ).toBe(false);
    const pendingWithPerson = { ...session, identityResult: "pending" };
    expect(ProctoringSessionSchema.safeParse(pendingWithPerson).success).toBe(false);
    expect(
      ProctoringSessionSchema.safeParse({ ...session, endedAt: "2026-07-20T04:00:00Z" }).success,
    ).toBe(false);
    expect(ProctoringSessionSchema.safeParse({ ...session, endedAt: null }).success).toBe(false);
    expect(ProctoringSessionSchema.safeParse({ ...session, faceTemplate: "base64…" }).success).toBe(
      false,
    );
  });
});

describe("recording segments", () => {
  it("accepts a screen and a camera segment", () => {
    expect(RecordingSegmentSchema.safeParse(segment).success).toBe(true);
    expect(
      RecordingSegmentSchema.safeParse({ ...segment, id: "segment-2", kind: "camera" }).success,
    ).toBe(true);
  });

  it("rejects a segment ending at its start and a storage URL", () => {
    expect(
      RecordingSegmentSchema.safeParse({ ...segment, endedAt: segment.startedAt }).success,
    ).toBe(false);
    expect(RecordingSegmentSchema.safeParse({ ...segment, deleteOn: "2026-07-19" }).success).toBe(
      false,
    );
    expect(RecordingSegmentSchema.safeParse({ ...segment, url: "https://x/y.webm" }).success).toBe(
      false,
    );
  });
});

describe("proctoring flags", () => {
  it("accepts browser, AI and staff flags in each review state", () => {
    const browserFlag = {
      ...aiFlag,
      id: "flag-2",
      kind: "tab_switch",
      source: "browser",
      aiGenerated: false,
      confidenceBps: null,
      reason: "Switched tab twice.",
    };
    const staffFlag = {
      ...browserFlag,
      id: "flag-3",
      kind: "other_voices",
      source: "staff",
      reason: "Voices heard on the call.",
    };
    const states: Record<ProctoringFlagReview, object> = {
      pending: {},
      dismissed: reviewed,
      upheld: {
        ...reviewed,
        reviewNote: "Confirmed with the recording; referred to the exam board.",
      },
    };
    for (const flag of [aiFlag, browserFlag, staffFlag]) {
      for (const [review, extra] of Object.entries(states)) {
        expect(ProctoringFlagSchema.safeParse({ ...flag, ...extra, review }).success).toBe(true);
      }
    }
  });

  it("rejects inconsistent AI marks, inferred emotions and unreviewed decisions", () => {
    expect(ProctoringFlagSchema.safeParse({ ...aiFlag, confidenceBps: null }).success).toBe(false);
    expect(ProctoringFlagSchema.safeParse({ ...aiFlag, aiGenerated: false }).success).toBe(false);
    const staffWithAi = { ...aiFlag, source: "staff", confidenceBps: null };
    expect(ProctoringFlagSchema.safeParse(staffWithAi).success).toBe(false);
    const browserWithConfidence = { ...aiFlag, source: "browser", aiGenerated: false };
    expect(ProctoringFlagSchema.safeParse(browserWithConfidence).success).toBe(false);
    for (const kind of ["emotion", "suspicious_gaze", "nervous_behaviour"]) {
      expect(ProctoringFlagSchema.safeParse({ ...aiFlag, kind }).success).toBe(false);
    }
    expect(
      ProctoringFlagSchema.safeParse({ ...aiFlag, ...reviewed, review: "upheld" }).success,
    ).toBe(false);
    expect(ProctoringFlagSchema.safeParse({ ...aiFlag, review: "dismissed" }).success).toBe(false);
    const earlyReview = {
      ...aiFlag,
      ...reviewed,
      review: "dismissed",
      reviewedAt: "2026-07-20T05:00:00Z",
    };
    expect(ProctoringFlagSchema.safeParse(earlyReview).success).toBe(false);
  });
});
