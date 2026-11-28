import type * as C from "@nexus/contracts";
import { PERSON } from "./ids";
import { ONLINE_TEST as OT, TEST_ATTEMPT as TA } from "./ids-stage4-assess";
import {
  PROCTORING_FLAG as PF,
  PROCTORING_SESSION as PS,
  RECORDING_SEGMENT as RS,
} from "./ids-stage4-live";
import { ONLINE_TESTS, TEST_ATTEMPTS } from "./question-tests";
import { ROLE_PROFILES } from "./role-profiles";
import { UPDATED_AT } from "./tenants";

const PROVIDER = "demo";
const NOTICE_V1 = "2026-v1";
const z = (s: string): string => (s.length === 8 ? `2026-${s}:00:00Z` : `2026-${s}:00Z`);

const staffId = (personId: string): string => {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "staff");
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
};

const byId = <R extends { id: string }>(rows: readonly R[], id: string): R => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`Missing record ${id}`);
  return row;
};

const nbElena = staffId(PERSON.nbElena);
const nbMarcus = staffId(PERSON.nbMarcus);
const axMeena = staffId(PERSON.axMeena);
const axSuresh = staffId(PERSON.axSuresh);

const setting = (
  testId: string,
  identityCheck: C.IdentityCheckMode,
  browserLock: boolean,
  recording: C.RecordingMode,
  retentionDays: number | null,
  aiFlagging: boolean,
  updatedByStaffProfileId: string,
): C.ProctoringSettings => ({
  tenantId: byId(ONLINE_TESTS, testId).tenantId,
  testId,
  provider: PROVIDER,
  identityCheck,
  browserLock,
  recording,
  retentionDays,
  aiFlagging,
  noticeVersion: NOTICE_V1,
  updatedByStaffProfileId,
  updatedAt: UPDATED_AT,
});

export const PROCTORING_SETTINGS: readonly C.ProctoringSettings[] = [
  setting(OT.nbCsMidterm, "id_document_view", true, "screen_and_camera", 90, true, nbElena),
  setting(OT.axMock, "staff_photo_match", true, "screen", 60, true, axMeena),
  setting(OT.axAdaptive, "none", false, "none", null, false, axSuresh),
];

interface SessionOpts {
  status: C.ProctoringSessionStatus;
  noticeAt?: string;
  idRes: C.IdentityResult;
  idBy?: string;
  idAt?: string;
  start?: string;
  end?: string;
}

const session = (id: string, attemptId: string, o: SessionOpts): C.ProctoringSession => {
  const att = byId(TEST_ATTEMPTS, attemptId);
  return {
    id,
    tenantId: att.tenantId,
    testId: att.testId,
    attemptId,
    learnerId: att.learnerId,
    status: o.status,
    noticeVersion: NOTICE_V1,
    noticeAcceptedAt: o.noticeAt ? z(o.noticeAt) : null,
    identityResult: o.idRes,
    identityCheckedByStaffProfileId: o.idBy ?? null,
    identityCheckedAt: o.idAt ? z(o.idAt) : null,
    startedAt: o.start ? z(o.start) : null,
    endedAt: o.end ? z(o.end) : null,
  };
};

export const PROCTORING_SESSIONS: readonly C.ProctoringSession[] = [
  session(PS.nbJordan, TA.nbJordanMid, {
    status: "ended",
    noticeAt: "09-12T13:58",
    idRes: "verified",
    idBy: nbElena,
    idAt: "09-12T13:59",
    start: "09-12T14",
    end: "09-12T14:38",
  }),
  session(PS.nbSofia, TA.nbSofiaMid, {
    status: "in_progress",
    noticeAt: "09-12T13:57",
    idRes: "not_verified",
    idBy: nbMarcus,
    idAt: "09-12T14:04",
    start: "09-12T14",
  }),
  session(PS.axVijay, TA.axVijayMock, {
    status: "ended",
    noticeAt: "09-16T04:58",
    idRes: "not_required",
    start: "09-16T05",
    end: "09-16T05:52",
  }),
  session(PS.axDivya, TA.axDivyaMock, {
    status: "waiting",
    idRes: "pending",
  }),
];

const seg = (
  id: string,
  sessionId: string,
  kind: C.RecordingSegment["kind"],
  start: string,
  end: string,
  sizeBytes: number,
  deleteOn: string,
): C.RecordingSegment => ({
  id,
  tenantId: byId(PROCTORING_SESSIONS, sessionId).tenantId,
  sessionId,
  kind,
  startedAt: z(start),
  endedAt: z(end),
  sizeBytes,
  deleteOn,
});

const NB_DEL = "2026-12-11";
const AX_DEL = "2026-11-15";

/** Apex minor Vijay has no current guardian camera consent, so only the screen is recorded (G-6). */
export const RECORDING_SEGMENTS: readonly C.RecordingSegment[] = [
  seg(RS.nbJordanScreen, PS.nbJordan, "screen", "09-12T14", "09-12T14:38", 42_500_000, NB_DEL),
  seg(RS.nbJordanCamera, PS.nbJordan, "camera", "09-12T14", "09-12T14:38", 31_200_000, NB_DEL),
  seg(RS.nbSofiaScreen, PS.nbSofia, "screen", "09-12T14", "09-12T14:20", 24_100_000, NB_DEL),
  seg(RS.nbSofiaCamera, PS.nbSofia, "camera", "09-12T14", "09-12T14:20", 18_400_000, NB_DEL),
  seg(RS.axVijayScreen, PS.axVijay, "screen", "09-16T05", "09-16T05:52", 38_900_000, AX_DEL),
];

interface FlagOpts {
  kind: C.ProctoringFlagKind;
  source: C.ProctoringFlagSource;
  conf?: number;
  reason: string;
  at: string;
  offset: number;
  review: C.ProctoringFlagReview;
  by?: string;
  revAt?: string;
  note?: string;
}

const flag = (id: string, sessionId: string, o: FlagOpts): C.ProctoringFlag => ({
  id,
  tenantId: byId(PROCTORING_SESSIONS, sessionId).tenantId,
  sessionId,
  kind: o.kind,
  source: o.source,
  aiGenerated: o.source === "ai",
  confidenceBps: o.conf ?? null,
  reason: o.reason,
  occurredAt: z(o.at),
  offsetSeconds: o.offset,
  review: o.review,
  reviewedByStaffProfileId: o.by ?? null,
  reviewedAt: o.revAt ? z(o.revAt) : null,
  reviewNote: o.note ?? null,
});

export const PROCTORING_FLAGS: readonly C.ProctoringFlag[] = [
  flag(PF.nbJordanTab, PS.nbJordan, {
    kind: "tab_switch",
    source: "browser",
    reason: "Browser reported focus moved to another tab for 12 seconds.",
    at: "09-12T14:05",
    offset: 300,
    review: "dismissed",
    by: nbElena,
    revAt: "09-12T15:10",
    note: "Brief switch to allowed course reference tab.",
  }),
  flag(PF.nbJordanCopy, PS.nbJordan, {
    kind: "copy_paste",
    source: "browser",
    reason: "Paste shortcut was pressed inside the essay response box.",
    at: "09-12T14:15",
    offset: 900,
    review: "upheld",
    by: nbElena,
    revAt: "09-12T15:20",
    note: "Referred to academic integrity review; attempt left unchanged.",
  }),
  flag(PF.nbJordanNoPerson, PS.nbJordan, {
    kind: "no_person_visible",
    source: "ai",
    conf: 8400,
    reason: "No person was visible in the camera frame for 25 seconds.",
    at: "09-12T14:22",
    offset: 1320,
    review: "dismissed",
    by: nbElena,
    revAt: "09-12T15:25",
    note: "Learner leaned down to pick up a dropped pen.",
  }),
  flag(PF.nbSofiaOther, PS.nbSofia, {
    kind: "other",
    source: "staff",
    reason: "Proctor noted an unclear photo during manual ID document check.",
    at: "09-12T14:04",
    offset: 240,
    review: "upheld",
    by: nbMarcus,
    revAt: "09-12T14:10",
    note: "Follow-up ID check requested outside the test; attempt unchanged.",
  }),
  flag(PF.nbSofiaAnother, PS.nbSofia, {
    kind: "another_person_visible",
    source: "ai",
    conf: 9100,
    reason: "A second person appeared briefly in the background of the frame.",
    at: "09-12T14:08",
    offset: 480,
    review: "pending",
  }),
  flag(PF.nbSofiaVoices, PS.nbSofia, {
    kind: "other_voices",
    source: "ai",
    conf: 7600,
    reason: "Additional speech was detected in the room audio track.",
    at: "09-12T14:12",
    offset: 720,
    review: "pending",
  }),
  flag(PF.axVijayBlur, PS.axVijay, {
    kind: "window_blur",
    source: "browser",
    reason: "Exam window lost desktop focus for 9 seconds.",
    at: "09-16T05:10",
    offset: 600,
    review: "dismissed",
    by: axMeena,
    revAt: "09-16T06:15",
    note: "System battery notification interrupted focus briefly.",
  }),
  flag(PF.axVijayDisconnect, PS.axVijay, {
    kind: "device_disconnected",
    source: "browser",
    reason: "Screen capture stream disconnected for 18 seconds before reconnecting.",
    at: "09-16T05:25",
    offset: 1500,
    review: "pending",
  }),
];
