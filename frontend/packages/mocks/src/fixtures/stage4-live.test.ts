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
  ["PROCTORING_SETTINGS", C.ProctoringSettingsSchema, F.PROCTORING_SETTINGS],
  ["PROCTORING_SESSIONS", C.ProctoringSessionSchema, F.PROCTORING_SESSIONS],
  ["RECORDING_SEGMENTS", C.RecordingSegmentSchema, F.RECORDING_SEGMENTS],
  ["PROCTORING_FLAGS", C.ProctoringFlagSchema, F.PROCTORING_FLAGS],
  ["LIVE_SESSIONS", C.LiveSessionSchema, F.LIVE_SESSIONS],
  ["LIVE_JOINS", C.LiveJoinSchema, F.LIVE_JOINS],
  ["LIVE_RECORDINGS", C.LiveRecordingSchema, F.LIVE_RECORDINGS],
  ["LIVE_SUMMARIES", C.LiveSummarySchema, F.LIVE_SUMMARIES],
];

const T = F.TENANT;
const tenants = new Set(F.DEMO_TENANTS.map(({ tenantId }) => tenantId));
const staff = F.ROLE_PROFILES.filter(({ kind }) => kind === "staff");
const aiOn = new Set(F.AI_SETTINGS.filter((r) => r.enabled).map((r) => r.tenantId));
const byId = <R extends { id: string }>(rows: readonly R[], id: string | null) =>
  id === null ? undefined : rows.find((r) => r.id === id);

function hasAll<R, K extends keyof R>(
  rows: readonly R[],
  key: K,
  schema: { options: readonly R[K][] },
) {
  expect(new Set(rows.map((r) => r[key]))).toEqual(new Set(schema.options));
}

type RefRow = { id: string; tenantId: string };
const ref = (rows: readonly RefRow[], id: string | null, t: string) => {
  if (id !== null) expect(byId(rows, id)?.tenantId, id).toBe(t);
};

const inCal = (t: string, d: string | null) => {
  if (d === null) return;
  const cal = F.ACADEMIC_CALENDARS.find((r) => r.tenantId === t);
  expect(d >= (cal?.startsOn ?? "") && d <= (cal?.endsOn ?? ""), d).toBe(true);
};

const FORBIDDEN_KEY = /url|link|password|secret|token|apikey/i;
const FORBIDDEN_VAL = /https?:\/\/|wss?:\/\/|password|secret|bearer /i;

function assertNoUrlOrSecret(value: unknown, path: string): void {
  if (typeof value === "string") {
    expect(FORBIDDEN_VAL.test(value), `${path}=${value}`).toBe(false);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoUrlOrSecret(item, `${path}[${i}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      expect(FORBIDDEN_KEY.test(k), `${path}.${k}`).toBe(false);
      assertNoUrlOrSecret(v, `${path}.${k}`);
    }
  }
}

describe("Stage 4 M34 and M36 fixtures (NEX-257)", () => {
  it.each(SETS)("%s parse with their contract and have unique ids", (name, schema, rows) => {
    expect(rows.length, name).toBeGreaterThan(0);
    for (const row of rows) {
      expect(tenants.has(row.tenantId), `${name}:${row.tenantId}`).toBe(true);
      expect(schema.safeParse(row).error, row.id ?? name).toBeUndefined();
      assertNoUrlOrSecret(row, row.id ?? name);
    }
    const ids = rows.map(({ id }) => id).filter((id): id is string => id !== undefined);
    if (ids.length > 0) expect(new Set(ids).size, name).toBe(rows.length);
  });

  it("resolve M34 proctoring settings, sessions, recordings, flags, and G-6 consent", () => {
    const allowedTenants = new Set<string>([T.northbridge, T.apex]);
    for (const r of [
      ...F.PROCTORING_SETTINGS,
      ...F.PROCTORING_SESSIONS,
      ...F.RECORDING_SEGMENTS,
      ...F.PROCTORING_FLAGS,
    ]) {
      expect(allowedTenants.has(r.tenantId), r.tenantId).toBe(true);
    }
    expect(new Set(F.PROCTORING_SETTINGS.map((r) => r.testId)).size).toBe(
      F.PROCTORING_SETTINGS.length,
    );
    hasAll(F.PROCTORING_SETTINGS, "identityCheck", C.IdentityCheckModeSchema);
    hasAll(F.PROCTORING_SETTINGS, "recording", C.RecordingModeSchema);
    for (const t of F.ONLINE_TESTS.filter((r) => r.proctored)) {
      const hasCfg = F.PROCTORING_SETTINGS.some((s) => s.testId === t.id);
      expect(hasCfg, t.id).toBe(true);
    }
    for (const s of F.PROCTORING_SETTINGS) {
      expect(s.provider, s.testId).toBe("demo");
      ref(F.ONLINE_TESTS, s.testId, s.tenantId);
      ref(staff, s.updatedByStaffProfileId, s.tenantId);
      if (s.aiFlagging) expect(aiOn.has(s.tenantId), s.testId).toBe(true);
    }

    hasAll(F.PROCTORING_SESSIONS, "status", C.ProctoringSessionStatusSchema);
    hasAll(F.PROCTORING_SESSIONS, "identityResult", C.IdentityResultSchema);
    expect(new Set(F.PROCTORING_SESSIONS.map((r) => r.attemptId)).size).toBe(
      F.PROCTORING_SESSIONS.length,
    );
    for (const ses of F.PROCTORING_SESSIONS) {
      ref(F.ONLINE_TESTS, ses.testId, ses.tenantId);
      ref(F.LEARNERS, ses.learnerId, ses.tenantId);
      ref(staff, ses.identityCheckedByStaffProfileId, ses.tenantId);
      const att = byId(F.TEST_ATTEMPTS, ses.attemptId);
      expect(att, ses.id).toMatchObject({
        tenantId: ses.tenantId,
        testId: ses.testId,
        learnerId: ses.learnerId,
      });
      const cfg = F.PROCTORING_SETTINGS.find((s) => s.testId === ses.testId);
      if (ses.status === "in_progress") {
        expect(ses.noticeAcceptedAt, ses.id).not.toBeNull();
        expect(ses.noticeVersion, ses.id).toBe(cfg?.noticeVersion);
      }
      if (ses.startedAt !== null) inCal(ses.tenantId, ses.startedAt.slice(0, 10));
      if (ses.endedAt !== null) inCal(ses.tenantId, ses.endedAt.slice(0, 10));
    }

    const segKinds = new Set(F.RECORDING_SEGMENTS.map((r) => r.kind));
    expect(segKinds).toEqual(new Set(["screen", "camera"]));
    for (const seg of F.RECORDING_SEGMENTS) {
      const ses = byId(F.PROCTORING_SESSIONS, seg.sessionId);
      expect(ses?.tenantId, seg.id).toBe(seg.tenantId);
      inCal(seg.tenantId, seg.startedAt.slice(0, 10));
      expect(seg.deleteOn >= seg.startedAt.slice(0, 10), seg.id).toBe(true);
      const learner = byId(F.LEARNERS, ses?.learnerId ?? null);
      const person = byId(F.PEOPLE, learner?.personId ?? null);
      if (seg.kind === "camera" && person?.isMinor) {
        const granted = F.CONSENTS.some(
          (c) =>
            c.tenantId === seg.tenantId &&
            c.personId === person.id &&
            c.purpose === "media_sharing" &&
            c.status === "granted",
        );
        expect(granted, seg.id).toBe(true);
      }
    }
    const apexMinorSegs = F.RECORDING_SEGMENTS.filter((r) => r.tenantId === T.apex);
    expect(apexMinorSegs.length).toBeGreaterThan(0);
    expect(apexMinorSegs.every((r) => r.kind === "screen")).toBe(true);

    hasAll(F.PROCTORING_FLAGS, "kind", C.ProctoringFlagKindSchema);
    hasAll(F.PROCTORING_FLAGS, "source", C.ProctoringFlagSourceSchema);
    hasAll(F.PROCTORING_FLAGS, "review", C.ProctoringFlagReviewSchema);
    for (const fl of F.PROCTORING_FLAGS) {
      const ses = byId(F.PROCTORING_SESSIONS, fl.sessionId);
      expect(ses?.tenantId, fl.id).toBe(fl.tenantId);
      ref(staff, fl.reviewedByStaffProfileId, fl.tenantId);
      if (fl.aiGenerated) expect(aiOn.has(fl.tenantId), fl.id).toBe(true);
      inCal(fl.tenantId, fl.occurredAt.slice(0, 10));
      if (fl.review === "upheld") {
        const att = byId(F.TEST_ATTEMPTS, ses?.attemptId ?? null);
        expect(att?.status, fl.id).toMatch(/^(submitted|marked|released|auto_submitted)$/);
      }
    }
    const nbUpheld = F.PROCTORING_FLAGS.find(
      (f) => f.review === "upheld" && f.tenantId === T.northbridge && f.kind === "copy_paste",
    );
    const nbSes = byId(F.PROCTORING_SESSIONS, nbUpheld?.sessionId ?? null);
    const nbAtt = byId(F.TEST_ATTEMPTS, nbSes?.attemptId ?? null);
    expect(nbAtt).toMatchObject({ status: "marked", scorePoints: 13 });
  });

  it("resolve M36 live sessions, joins, recordings, summaries, and course items", () => {
    hasAll(F.LIVE_SESSIONS, "status", C.LiveSessionStatusSchema);
    expect(F.LIVE_SESSIONS.some((r) => r.tenantId === T.riverside)).toBe(true);
    expect(F.LIVE_SESSIONS.some((r) => r.tenantId === T.northbridge)).toBe(true);
    expect(F.LIVE_SESSIONS.filter((r) => r.tenantId === T.harmony)).toHaveLength(1);
    for (const s of F.LIVE_SESSIONS) {
      expect(s.provider, s.id).toBe("demo");
      ref(F.COURSE_SPACES, s.courseSpaceId, s.tenantId);
      ref(F.TIMETABLE_SLOTS, s.timetableSlotId, s.tenantId);
      for (const hid of s.hostStaffProfileIds) ref(staff, hid, s.tenantId);
      inCal(s.tenantId, s.scheduledStart.slice(0, 10));
      inCal(s.tenantId, s.scheduledEnd.slice(0, 10));
      if (s.actualStart !== null) inCal(s.tenantId, s.actualStart.slice(0, 10));
      if (s.actualEnd !== null) inCal(s.tenantId, s.actualEnd.slice(0, 10));
    }

    expect(new Set(F.LIVE_JOINS.map((r) => r.role))).toEqual(new Set(["host", "participant"]));
    for (const j of F.LIVE_JOINS) {
      const ses = byId(F.LIVE_SESSIONS, j.sessionId);
      const sp = byId(F.COURSE_SPACES, ses?.courseSpaceId ?? null);
      const prof = byId(F.ROLE_PROFILES, j.profileId);
      expect(ses?.tenantId, j.id).toBe(j.tenantId);
      expect(prof?.tenantId, j.id).toBe(j.tenantId);
      if (j.role === "host") {
        expect(prof?.kind, j.id).toBe("staff");
        expect(ses?.hostStaffProfileIds, j.id).toContain(j.profileId);
      } else {
        expect(prof?.kind, j.id).toBe("learner");
        const lrn = F.LEARNERS.find((l) => l.roleProfileId === j.profileId);
        const enr = F.ENROLMENTS.find((e) => e.learnerId === lrn?.id);
        expect(sp?.classGroupIds, j.id).toContain(enr?.classGroupId);
      }
      inCal(j.tenantId, j.joinedAt.slice(0, 10));
      if (j.leftAt !== null) inCal(j.tenantId, j.leftAt.slice(0, 10));
    }

    hasAll(F.LIVE_RECORDINGS, "status", C.LiveRecordingStatusSchema);
    for (const rec of F.LIVE_RECORDINGS) {
      ref(F.LIVE_SESSIONS, rec.sessionId, rec.tenantId);
      inCal(rec.tenantId, rec.createdAt.slice(0, 10));
      expect(rec.deleteOn >= rec.createdAt.slice(0, 10), rec.id).toBe(true);
    }

    const sumStatuses = new Set(F.LIVE_SUMMARIES.map((r) => r.status));
    expect(sumStatuses).toEqual(new Set(["draft", "published"]));
    for (const sum of F.LIVE_SUMMARIES) {
      expect(aiOn.has(sum.tenantId), sum.id).toBe(true);
      ref(F.LIVE_SESSIONS, sum.sessionId, sum.tenantId);
      ref(staff, sum.publishedByStaffProfileId, sum.tenantId);
      const rec = byId(F.LIVE_RECORDINGS, sum.recordingId);
      expect(rec, sum.id).toMatchObject({
        tenantId: sum.tenantId,
        sessionId: sum.sessionId,
        status: "ready",
      });
      const len = rec?.durationSeconds ?? 0;
      expect(sum.chapters.length, sum.id).toBeGreaterThan(0);
      for (const ch of sum.chapters) {
        expect(ch.startSeconds, `${sum.id}:${ch.title}`).toBeLessThan(len);
      }
      inCal(sum.tenantId, sum.createdAt.slice(0, 10));
      if (sum.publishedAt !== null) inCal(sum.tenantId, sum.publishedAt.slice(0, 10));
    }

    const liveItems = F.COURSE_ITEMS.filter((i) => i.kind === "live_session");
    expect(liveItems.length).toBeGreaterThanOrEqual(2);
    for (const itm of liveItems) {
      const mod = byId(F.COURSE_MODULES, itm.moduleId);
      expect(byId(F.LIVE_SESSIONS, itm.refId), itm.id).toMatchObject({
        tenantId: itm.tenantId,
        courseSpaceId: mod?.courseSpaceId,
      });
    }
  });
});
