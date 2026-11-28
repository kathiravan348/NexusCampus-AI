import type * as C from "@nexus/contracts";
import { CONSENTS } from "./compliance";
import { COURSE_SPACES } from "./courses";
import { PERSON, TENANT as T } from "./ids";
import { LEARNER as L } from "./ids-stage3";
import {
  ASSIGNMENT as ASG,
  LEARNING_PATH as LPA,
  LEARNING_PATH_STEP as LPS,
  ONLINE_TEST as TST,
  TUTOR_MESSAGE as TMG,
  TUTOR_SESSION as TSE,
} from "./ids-stage4-assess";
import { CONTENT_ITEM as CI, COURSE_SPACE as CS, OUTCOME as O } from "./ids-stage4-learning";
import { LIVE_SESSION as LVS } from "./ids-stage4-live";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };
const z = (s: string): string => (s.length === 8 ? `2026-${s}:00:00Z` : `2026-${s}:00Z`);
const src = (
  moduleId: C.AssistSource["moduleId"],
  recordType: string,
  recordId: string,
  label: string,
): C.AssistSource => ({ moduleId, recordType, recordId, label });

const staffId = (personId: string): string => {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "staff");
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
};
const aiConsentId = (personId: string): string => {
  const row = CONSENTS.find(
    (c) => c.personId === personId && c.purpose === "ai_features" && c.status === "granted",
  );
  if (!row) throw new Error(`Missing granted ai_features consent for ${personId}`);
  return row.id;
};
const tenantOf = <R extends { id: string; tenantId: string }>(rows: readonly R[], id: string) => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`Missing record ${id}`);
  return row.tenantId;
};

const lsPr = staffId(PERSON.lsPriya);
const rvAm = staffId(PERSON.rvAmira);
const nbEl = staffId(PERSON.nbElena);
const axMn = staffId(PERSON.axMeena);
const hmDn = staffId(PERSON.hmDaniel);

const mr = (
  tenantId: string,
  learnerId: string,
  outcomeId: string,
  level: C.MasteryLevel,
  scoreBps: number,
  evidenceCount: number,
  at: string | null,
): C.MasteryRecord => ({
  tenantId,
  learnerId,
  outcomeId,
  level,
  scoreBps,
  evidenceCount,
  lastEvidenceAt: at ? z(at) : null,
  updatedAt: at ? z(at) : UPDATED_AT,
});

export const MASTERY_RECORDS: readonly C.MasteryRecord[] = [
  mr(T.littleSteps, L.lsKavya, O.lsLang1, "secure", 8200, 3, "07-10T06"),
  mr(T.riverside, L.rvMia, O.rvMathFrac, "mastered", 9400, 5, "09-16T15:10"),
  mr(T.riverside, L.rvElla, O.rvEngWrite, "developing", 6800, 2, "09-17T14:30"),
  mr(T.northbridge, L.nbJordan, O.nbCo1, "mastered", 9100, 4, "09-14T18:45"),
  mr(T.apex, L.axVijay, O.axAlgQuad, "emerging", 4500, 2, "09-18T09:20"),
  mr(T.apex, L.axDivya, O.axAlgQuad, "not_started", 0, 0, null),
  mr(T.harmony, L.hmEthan, O.hmGrade1, "secure", 8600, 3, "06-12T08:10"),
];

const stp = (
  id: string,
  order: number,
  kind: C.LearningPathStepKind,
  refId: string,
  outcomeId: string,
  status: C.LearningPathStepStatus,
  reason: string,
): C.LearningPathStep => ({ id, order, kind, refId, outcomeId, status, reason });

const lp = (
  id: string,
  learnerId: string,
  courseSpaceId: string,
  source: C.LearningPath["source"],
  assignedByStaffProfileId: string | null,
  status: C.LearningPath["status"],
  steps: C.LearningPathStep[],
): C.LearningPath => ({
  id,
  tenantId: tenantOf(COURSE_SPACES, courseSpaceId),
  learnerId,
  courseSpaceId,
  source,
  assignedByStaffProfileId,
  status,
  steps,
  ...ts,
});

export const LEARNING_PATHS: readonly C.LearningPath[] = [
  lp(LPA.rvMiaMath, L.rvMia, CS.rvY5Math, "teacher", rvAm, "active", [
    stp(LPS.rvMia1, 1, "content", CI.rvFractionsLesson, O.rvMathFrac, "done", "Intro fractions."),
    stp(LPS.rvMia2, 2, "practice", TST.rvFracQuiz, O.rvMathFrac, "done", "Builds fluency."),
    stp(LPS.rvMia3, 3, "assignment", ASG.rvFracPractice, O.rvMathFrac, "available", "Class tasks."),
  ]),
  lp(LPA.axVijayAlg, L.axVijay, CS.axAlgebra, "adaptive", null, "active", [
    stp(LPS.axVijay1, 1, "content", CI.axCmi5Drill, O.axAlgQuad, "skipped", "Diagnostic passed."),
    stp(LPS.axVijay2, 2, "test", TST.axMock, O.axAlgQuad, "available", "Timed mock practice."),
    stp(LPS.axVijay3, 3, "test", TST.axAdaptive, O.axMechKin, "locked", "Unlocks after mock."),
  ]),
  lp(LPA.nbJordanCs, L.nbJordan, CS.nbCs101, "teacher", nbEl, "completed", [
    stp(LPS.nbJordan1, 1, "assignment", ASG.nbAlgoLab, O.nbCo1, "done", "Applies invariants."),
    stp(LPS.nbJordan2, 2, "live_session", LVS.nbCs101OfficeHour, O.nbCo2, "done", "Live lab Q&A."),
  ]),
  lp(LPA.hmEthanPiano, L.hmEthan, CS.hmPiano, "teacher", hmDn, "paused", [
    stp(LPS.hmEthan1, 1, "content", CI.hmEarAudio, O.hmGrade2, "available", "Interval drill."),
  ]),
];

const tset = (
  courseSpaceId: string,
  enabled: boolean,
  mode: C.TutorMode,
  audience: C.TutorAudience,
  sourceContentIds: string[],
  dailyMessageLimit: number,
  transcriptsVisibleToStaff: boolean,
  updatedByStaffProfileId: string,
): C.TutorSettings => ({
  tenantId: tenantOf(COURSE_SPACES, courseSpaceId),
  courseSpaceId,
  enabled,
  mode,
  audience,
  sourceContentIds,
  dailyMessageLimit,
  transcriptsVisibleToStaff,
  updatedByStaffProfileId,
  updatedAt: UPDATED_AT,
});

export const TUTOR_SETTINGS: readonly C.TutorSettings[] = [
  tset(CS.lsStory, false, "hints_only", "children", [], 5, true, lsPr),
  tset(CS.rvY5Math, true, "hints_only", "children", [CI.rvFractionsLesson], 20, true, rvAm),
  tset(CS.nbCs101, true, "socratic", "adults", [CI.nbScormLab], 50, false, nbEl),
  tset(CS.axAlgebra, true, "explain", "teens", [CI.axCmi5Drill], 40, true, axMn),
  tset(CS.hmPiano, false, "explain", "adults", [CI.hmEarAudio], 15, false, hmDn),
];

const ses = (
  id: string,
  learnerId: string,
  courseSpaceId: string,
  consentId: string | null,
  status: "open" | "closed",
  win: readonly [string, string | null],
  messageCount: number,
  vis: boolean,
  flaggedForReview: boolean,
): C.TutorSession => ({
  id,
  tenantId: tenantOf(COURSE_SPACES, courseSpaceId),
  learnerId,
  courseSpaceId,
  learnerIsMinor: consentId !== null,
  consentId,
  status,
  startedAt: z(win[0]),
  endedAt: win[1] ? z(win[1]) : null,
  messageCount,
  transcriptsVisibleToStaff: vis,
  flaggedForReview,
});

const miaC = aiConsentId(PERSON.rvMia);

export const TUTOR_SESSIONS: readonly C.TutorSession[] = [
  ses(
    TSE.rvMiaFractions,
    L.rvMia,
    CS.rvY5Math,
    miaC,
    "closed",
    ["09-15T15", "09-15T15:10"],
    2,
    true,
    false,
  ),
  ses(TSE.nbJordanLoops, L.nbJordan, CS.nbCs101, null, "open", ["09-13T18", null], 4, false, true),
  ses(
    TSE.axArunQuad,
    L.axArun,
    CS.axAlgebra,
    null,
    "closed",
    ["09-17T10", "09-17T10:12"],
    2,
    true,
    false,
  ),
];

const lMsg = (id: string, sessionId: string, text: string, at: string): C.TutorMessage => ({
  id,
  tenantId: tenantOf(TUTOR_SESSIONS, sessionId),
  sessionId,
  role: "learner",
  text,
  createdAt: z(at),
});

const tMsg = (
  id: string,
  sessionId: string,
  text: string,
  tier: C.CapabilityTier,
  locale: C.Locale,
  sources: C.AssistSource[],
  at: string,
  safetyCategory: C.TutorSafetyCategory | null = null,
): C.TutorMessage => ({
  id,
  tenantId: tenantOf(TUTOR_SESSIONS, sessionId),
  sessionId,
  role: "tutor",
  text,
  aiGenerated: true,
  tier,
  sources,
  locale,
  blocked: safetyCategory !== null,
  safetyCategory,
  feedback: safetyCategory === null ? "helpful" : null,
  createdAt: z(at),
});

export const TUTOR_MESSAGES: readonly C.TutorMessage[] = [
  lMsg(TMG.rvMia1, TSE.rvMiaFractions, "How do I check if 2/4 equals 1/2?", "09-15T15:01"),
  tMsg(
    TMG.rvMia2,
    TSE.rvMiaFractions,
    "Hint: compare the fraction wall and divide top and bottom of 2/4 by 2.",
    "fast",
    "en-GB",
    [
      src("M31", "contentItem", CI.rvFractionsLesson, "Equivalent Fractions Interactive Lesson"),
      src("M29", "outcome", O.rvMathFrac, "RV.MATH.5.1 Adds fractions"),
    ],
    "09-15T15:02",
  ),
  lMsg(TMG.nbJordan1, TSE.nbJordanLoops, "What should a loop invariant hold first?", "09-13T18:02"),
  tMsg(
    TMG.nbJordan2,
    TSE.nbJordanLoops,
    "Check which relation your initialised variables guarantee before entering the loop.",
    "balanced",
    "en-US",
    [src("M31", "contentItem", CI.nbScormLab, "Control Flow and Loops Lab (SCORM 2004)")],
    "09-13T18:03",
  ),
  lMsg(TMG.nbJordan3, TSE.nbJordanLoops, "Write the graded lab report for me.", "09-13T18:05"),
  tMsg(
    TMG.nbJordan4,
    TSE.nbJordanLoops,
    "I cannot write a graded submission for you. Share your draft proof and we can check it.",
    "fast",
    "en-US",
    [],
    "09-13T18:06",
    "academic_integrity",
  ),
  lMsg(
    TMG.axArun1,
    TSE.axArunQuad,
    "இருபடி சமன்பாட்டின் பாகுபாட்டி பூஜ்ஜியமானால் என்ன ஆகும்?",
    "09-17T10:02",
  ),
  tMsg(
    TMG.axArun2,
    TSE.axArunQuad,
    "பாகுபாட்டி b^2 - 4ac = 0 எனில், சமன்பாட்டிற்கு இரண்டு சமமான மெய் மூலங்கள் கிடைக்கும்.",
    "balanced",
    "ta-IN",
    [src("M31", "contentItem", CI.axCmi5Drill, "Quadratic Discriminant Timed Drill (cmi5)")],
    "09-17T10:03",
  ),
];
