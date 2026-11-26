import { describe, expect, it } from "vitest";
import {
  LiveJoinSchema,
  LiveRecordingSchema,
  LiveSessionSchema,
  LiveSummarySchema,
  type LiveJoin,
  type LiveRecording,
  type LiveRecordingStatus,
  type LiveSession,
  type LiveSummary,
} from "./index";

const ended: LiveSession = {
  id: "live-cs101-week3",
  tenantId: "tenant-university",
  courseSpaceId: "space-cs101",
  timetableSlotId: null,
  title: "Week 3 — memory and addresses",
  provider: "bigbluebutton",
  externalMeetingId: "bbb-7f3a",
  scheduledStart: "2026-08-04T09:00:00Z",
  scheduledEnd: "2026-08-04T10:00:00Z",
  hostStaffProfileIds: ["staff-lecturer"],
  status: "ended",
  actualStart: "2026-08-04T09:02:00Z",
  actualEnd: "2026-08-04T10:01:00Z",
  recordingEnabled: true,
  attendanceFromJoins: true,
  createdAt: "2026-08-01T08:00:00Z",
  updatedAt: "2026-08-04T10:01:00Z",
};
const join: LiveJoin = {
  id: "join-1",
  tenantId: "tenant-university",
  sessionId: ended.id,
  profileId: "learner-ravi",
  role: "participant",
  joinedAt: "2026-08-04T09:05:00Z",
  leftAt: "2026-08-04T09:58:00Z",
  durationSeconds: 3180,
};
const recording: LiveRecording = {
  id: "recording-1",
  tenantId: "tenant-university",
  sessionId: ended.id,
  status: "ready",
  durationSeconds: 3540,
  sizeBytes: 820_000_000,
  deleteOn: "2026-12-31",
  visibleToLearners: true,
  noticeShownToParticipants: true,
  createdAt: "2026-08-04T10:05:00Z",
};
const summary: LiveSummary = {
  id: "summary-1",
  tenantId: "tenant-university",
  sessionId: ended.id,
  recordingId: recording.id,
  aiGenerated: true,
  tier: "balanced",
  language: "en-IN",
  summary: "Addresses name memory cells; pointers hold addresses.",
  chapters: [
    { title: "Memory cells", startSeconds: 0 },
    { title: "Addresses", startSeconds: 840 },
    { title: "Pointers", startSeconds: 2100 },
  ],
  status: "published",
  publishedByStaffProfileId: "staff-lecturer",
  publishedAt: "2026-08-04T12:00:00Z",
  createdAt: "2026-08-04T10:30:00Z",
};

describe("live sessions", () => {
  it("accepts a session in each status, with BigBlueButton and the demo provider", () => {
    const scheduled = {
      ...ended,
      provider: "demo",
      status: "scheduled",
      actualStart: null,
      actualEnd: null,
      externalMeetingId: null,
    };
    const live = { ...ended, status: "live", actualEnd: null };
    const cancelled = { ...scheduled, status: "cancelled" };
    for (const session of [scheduled, live, ended, cancelled]) {
      expect(LiveSessionSchema.safeParse(session).success).toBe(true);
    }
  });

  it("rejects bad times, missing hosts and secrets", () => {
    expect(
      LiveSessionSchema.safeParse({ ...ended, scheduledEnd: ended.scheduledStart }).success,
    ).toBe(false);
    const scheduledWithStart = { ...ended, status: "scheduled", actualEnd: null };
    expect(LiveSessionSchema.safeParse(scheduledWithStart).success).toBe(false);
    expect(LiveSessionSchema.safeParse({ ...ended, status: "live" }).success).toBe(false);
    expect(
      LiveSessionSchema.safeParse({ ...ended, actualEnd: "2026-08-04T09:00:00Z" }).success,
    ).toBe(false);
    expect(LiveSessionSchema.safeParse({ ...ended, hostStaffProfileIds: [] }).success).toBe(false);
    expect(
      LiveSessionSchema.safeParse({ ...ended, joinUrl: "https://meet.example.org/x?pwd=1" })
        .success,
    ).toBe(false);
    expect(LiveSessionSchema.safeParse({ ...ended, password: "1234" }).success).toBe(false);
    expect(LiveSessionSchema.safeParse({ ...ended, provider: "Big Blue Button" }).success).toBe(
      false,
    );
  });
});

describe("joins", () => {
  it("accepts an open and a closed join", () => {
    expect(LiveJoinSchema.safeParse(join).success).toBe(true);
    expect(LiveJoinSchema.safeParse({ ...join, leftAt: null, durationSeconds: 0 }).success).toBe(
      true,
    );
  });

  it("rejects leaving before joining", () => {
    expect(LiveJoinSchema.safeParse({ ...join, leftAt: "2026-08-04T09:00:00Z" }).success).toBe(
      false,
    );
  });
});

describe("recordings and summaries", () => {
  it("accepts each recording status", () => {
    const statuses: LiveRecordingStatus[] = ["processing", "ready", "failed", "deleted"];
    for (const status of statuses) {
      expect(LiveRecordingSchema.safeParse({ ...recording, status }).success).toBe(true);
    }
    const processing = {
      ...recording,
      status: "processing",
      durationSeconds: null,
      sizeBytes: null,
    };
    expect(LiveRecordingSchema.safeParse(processing).success).toBe(true);
  });

  it("rejects a recording without notice or with a URL", () => {
    expect(
      LiveRecordingSchema.safeParse({ ...recording, noticeShownToParticipants: false }).success,
    ).toBe(false);
    expect(LiveRecordingSchema.safeParse({ ...recording, url: "https://x/rec.mp4" }).success).toBe(
      false,
    );
  });

  it("accepts a draft and a published summary", () => {
    expect(LiveSummarySchema.safeParse(summary).success).toBe(true);
    const draft = {
      ...summary,
      status: "draft",
      publishedByStaffProfileId: null,
      publishedAt: null,
      chapters: [],
    };
    expect(LiveSummarySchema.safeParse(draft).success).toBe(true);
  });

  it("rejects unsorted chapters, unlabelled or unpublished-by-a-person summaries", () => {
    const [first, second] = summary.chapters;
    expect(LiveSummarySchema.safeParse({ ...summary, chapters: [second, first] }).success).toBe(
      false,
    );
    expect(LiveSummarySchema.safeParse({ ...summary, chapters: [first, first] }).success).toBe(
      false,
    );
    expect(LiveSummarySchema.safeParse({ ...summary, aiGenerated: false }).success).toBe(false);
    expect(
      LiveSummarySchema.safeParse({ ...summary, publishedByStaffProfileId: null }).success,
    ).toBe(false);
    expect(LiveSummarySchema.safeParse({ ...summary, status: "draft" }).success).toBe(false);
    expect(
      LiveSummarySchema.safeParse({ ...summary, publishedAt: "2026-08-04T10:00:00Z" }).success,
    ).toBe(false);
  });
});
