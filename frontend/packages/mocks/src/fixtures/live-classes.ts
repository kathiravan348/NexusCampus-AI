import type * as C from "@nexus/contracts";
import { COURSE_SPACES } from "./courses";
import { PERSON } from "./ids";
import { CLASS_GROUP, timetableSlotId } from "./ids-stage3";
import { COURSE_SPACE as CS } from "./ids-stage4-learning";
import {
  LIVE_JOIN as LJ,
  LIVE_RECORDING as LR,
  LIVE_SESSION as LS,
  LIVE_SUMMARY as LM,
} from "./ids-stage4-live";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const PROVIDER = "demo";
const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };
const z = (s: string): string => (s.length === 8 ? `2026-${s}:00:00Z` : `2026-${s}:00Z`);

const profileId = (personId: string, kind: "staff" | "learner"): string => {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === kind);
  if (!row) throw new Error(`Missing ${kind} profile for ${personId}`);
  return row.id;
};

const byId = <R extends { id: string }>(rows: readonly R[], id: string): R => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`Missing record ${id}`);
  return row;
};

const P = {
  rvAmira: profileId(PERSON.rvAmira, "staff"),
  rvTom: profileId(PERSON.rvTom, "staff"),
  rvMia: profileId(PERSON.rvMia, "learner"),
  rvElla: profileId(PERSON.rvElla, "learner"),
  nbElena: profileId(PERSON.nbElena, "staff"),
  nbMarcus: profileId(PERSON.nbMarcus, "staff"),
  nbJordan: profileId(PERSON.nbJordan, "learner"),
  nbSofia: profileId(PERSON.nbSofia, "learner"),
  hmDaniel: profileId(PERSON.hmDaniel, "staff"),
};

interface SessionOpts {
  space: string;
  slot?: string;
  title: string;
  extId?: string;
  sched: readonly [string, string];
  hosts: string[];
  status: C.LiveSessionStatus;
  actual?: readonly [string, string | null];
  rec: boolean;
  att: boolean;
}

const liveSession = (id: string, o: SessionOpts): C.LiveSession => ({
  id,
  tenantId: byId(COURSE_SPACES, o.space).tenantId,
  courseSpaceId: o.space,
  timetableSlotId: o.slot ?? null,
  title: o.title,
  provider: PROVIDER,
  externalMeetingId: o.extId ?? null,
  scheduledStart: z(o.sched[0]),
  scheduledEnd: z(o.sched[1]),
  hostStaffProfileIds: o.hosts,
  status: o.status,
  actualStart: o.actual ? z(o.actual[0]) : null,
  actualEnd: o.actual?.[1] ? z(o.actual[1]) : null,
  recordingEnabled: o.rec,
  attendanceFromJoins: o.att,
  ...ts,
});

export const LIVE_SESSIONS: readonly C.LiveSession[] = [
  liveSession(LS.rvY5EngEnded, {
    space: CS.rvY5Eng,
    title: "Main Ideas Reading Walkthrough",
    extId: "demo-room-rv-y5-eng-1",
    sched: ["09-04T09", "09-04T09:50"],
    hosts: [P.rvAmira],
    status: "ended",
    actual: ["09-04T09:01", "09-04T09:41"],
    rec: true,
    att: true,
  }),
  liveSession(LS.rvY5MathEnded, {
    space: CS.rvY5Math,
    slot: timetableSlotId(CLASS_GROUP.rvSouthYearFive, 2),
    title: "Equivalent Fractions Live Lesson",
    extId: "demo-room-rv-y5-math-1",
    sched: ["09-14T09", "09-14T09:50"],
    hosts: [P.rvAmira],
    status: "ended",
    actual: ["09-14T09:01", "09-14T09:49"],
    rec: true,
    att: true,
  }),
  liveSession(LS.rvY9EngLive, {
    space: CS.rvY9Eng,
    title: "Thesis Building Live Workshop",
    extId: "demo-room-rv-y9-eng-1",
    sched: ["09-15T11:30", "09-15T12:20"],
    hosts: [P.rvTom],
    status: "live",
    actual: ["09-15T11:31", null],
    rec: false,
    att: true,
  }),
  liveSession(LS.rvY5MathCancelled, {
    space: CS.rvY5Math,
    title: "Extra Fractions Clinic",
    sched: ["09-18T14", "09-18T14:45"],
    hosts: [P.rvAmira],
    status: "cancelled",
    rec: false,
    att: false,
  }),
  liveSession(LS.nbCs101OfficeHour, {
    space: CS.nbCs101,
    slot: timetableSlotId(CLASS_GROUP.nbFirstYear, 1),
    title: "CS101 Loops & Invariants Live Q&A",
    extId: "demo-room-nb-cs101-1",
    sched: ["09-11T14", "09-11T14:50"],
    hosts: [P.nbElena],
    status: "ended",
    actual: ["09-11T14", "09-11T14:48"],
    rec: true,
    att: true,
  }),
  liveSession(LS.nbCs101Review, {
    space: CS.nbCs101,
    title: "CS101 Boundary Testing Review",
    extId: "demo-room-nb-cs101-2",
    sched: ["09-14T15", "09-14T15:45"],
    hosts: [P.nbElena, P.nbMarcus],
    status: "ended",
    actual: ["09-14T15:02", "09-14T15:44"],
    rec: true,
    att: false,
  }),
  liveSession(LS.hmPianoScheduled, {
    space: CS.hmPiano,
    slot: timetableSlotId(CLASS_GROUP.hmBeginner, 1),
    title: "Major Scales Group Recital",
    extId: "demo-room-hm-piano-1",
    sched: ["09-22T08", "09-22T08:45"],
    hosts: [P.hmDaniel],
    status: "scheduled",
    rec: true,
    att: true,
  }),
];

const join = (
  id: string,
  sessionId: string,
  profileIdVal: string,
  role: C.LiveJoin["role"],
  joinedAt: string,
  leftAt: string | null,
  durationSeconds: number,
): C.LiveJoin => ({
  id,
  tenantId: byId(LIVE_SESSIONS, sessionId).tenantId,
  sessionId,
  profileId: profileIdVal,
  role,
  joinedAt: z(joinedAt),
  leftAt: leftAt ? z(leftAt) : null,
  durationSeconds,
});

const rvEng = LS.rvY5EngEnded;
const rvMath = LS.rvY5MathEnded;
const nbCs = LS.nbCs101OfficeHour;
const nbRev = LS.nbCs101Review;
const DEC13 = "2026-12-13";

export const LIVE_JOINS: readonly C.LiveJoin[] = [
  join(LJ.rvMathAmira, rvMath, P.rvAmira, "host", "09-14T09:01", "09-14T09:49", 2880),
  join(LJ.rvMathMia, rvMath, P.rvMia, "participant", "09-14T09:02", "09-14T09:48", 2760),
  join(LJ.rvEngTom, LS.rvY9EngLive, P.rvTom, "host", "09-15T11:31", null, 1740),
  join(LJ.rvEngElla, LS.rvY9EngLive, P.rvElla, "participant", "09-15T11:33", null, 1620),
  join(LJ.nbCsElena, nbCs, P.nbElena, "host", "09-11T14", "09-11T14:48", 2880),
  join(LJ.nbCsJordan, nbCs, P.nbJordan, "participant", "09-11T14:01", "09-11T14:47", 2760),
  join(LJ.nbCsSofia, nbCs, P.nbSofia, "participant", "09-11T14:04", "09-11T14:45", 2460),
  join(LJ.nbRevElena, nbRev, P.nbElena, "host", "09-14T15:02", "09-14T15:44", 2520),
  join(LJ.nbRevJordan, nbRev, P.nbJordan, "participant", "09-14T15:03", "09-14T15:43", 2400),
];

const rec = (
  id: string,
  sessionId: string,
  status: C.LiveRecordingStatus,
  durationSeconds: number | null,
  sizeBytes: number | null,
  deleteOn: string,
  visibleToLearners: boolean,
  createdAt: string,
): C.LiveRecording => ({
  id,
  tenantId: byId(LIVE_SESSIONS, sessionId).tenantId,
  sessionId,
  status,
  durationSeconds,
  sizeBytes,
  deleteOn,
  visibleToLearners,
  noticeShownToParticipants: true,
  createdAt: z(createdAt),
});

export const LIVE_RECORDINGS: readonly C.LiveRecording[] = [
  rec(LR.rvY5EngDeleted, rvEng, "deleted", 2400, null, "2026-09-14", false, "09-04T09:55"),
  rec(LR.rvY5MathReady, rvMath, "ready", 2880, 185_000_000, DEC13, true, "09-14T09:55"),
  rec(LR.nbCs101Ready, nbCs, "ready", 2880, 210_000_000, "2026-12-10", true, "09-11T14:55"),
  rec(LR.nbCs101Processing, nbRev, "processing", null, null, DEC13, false, "09-14T15:50"),
  rec(LR.nbCs101Failed, nbRev, "failed", null, null, "2026-10-14", false, "09-14T15:46"),
];

export const LIVE_SUMMARIES: readonly C.LiveSummary[] = [
  {
    id: LM.rvY5MathPublished,
    tenantId: byId(LIVE_RECORDINGS, LR.rvY5MathReady).tenantId,
    sessionId: LS.rvY5MathEnded,
    recordingId: LR.rvY5MathReady,
    aiGenerated: true,
    tier: "balanced",
    language: "en-GB",
    summary:
      "Reviewed equivalent fractions on fraction walls and simplified fractions by common factors.",
    chapters: [
      { title: "Warm-up and fraction wall review", startSeconds: 0 },
      { title: "Finding equivalent fractions", startSeconds: 720 },
      { title: "Guided practice and wrap-up", startSeconds: 1800 },
    ],
    status: "published",
    publishedByStaffProfileId: P.rvAmira,
    publishedAt: z("09-14T11"),
    createdAt: z("09-14T10:05"),
  },
  {
    id: LM.nbCs101Draft,
    tenantId: byId(LIVE_RECORDINGS, LR.nbCs101Ready).tenantId,
    sessionId: LS.nbCs101OfficeHour,
    recordingId: LR.nbCs101Ready,
    aiGenerated: true,
    tier: "fast",
    language: "en-US",
    summary:
      "Covered loop invariant initialisation, maintenance, and termination proofs on array search.",
    chapters: [
      { title: "Loop invariant checklist", startSeconds: 0 },
      { title: "Worked array-search proof", startSeconds: 900 },
      { title: "Common off-by-one pitfalls", startSeconds: 1950 },
    ],
    status: "draft",
    publishedByStaffProfileId: null,
    publishedAt: null,
    createdAt: z("09-11T15:05"),
  },
];
