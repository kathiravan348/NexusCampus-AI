import type * as C from "@nexus/contracts";
import { COURSE_SPACES } from "./courses";
import { PERSON, TENANT as T } from "./ids";
import { ASSESSMENT, LEARNER as L, RUBRIC } from "./ids-stage3";
import {
  AI_MARKING_SUGGESTION as AM,
  ASSIGNMENT as AG,
  ASSIGNMENT_SUBMISSION as SB,
  FEEDBACK as FB,
  ORIGINALITY_SIGNAL as OR,
  PEER_REVIEW as PR,
} from "./ids-stage4-assess";
import { COURSE_SPACE as CS, OUTCOME as O } from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };
const z = (s: string): string => (s.length === 8 ? `2026-${s}:00:00Z` : `2026-${s}:00Z`);
const subUuid = (n: number): string => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
const rub = (u: number, e: number): Record<string, number> => ({ UNDERSTANDING: u, EXECUTION: e });
const f = (fileName: string, contentType: string, sizeBytes: number): C.SubmissionFile => ({
  fileName,
  contentType,
  sizeBytes,
});
const staffId = (personId: string): string => {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "staff");
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
};
const tenantOf = <R extends { id: string; tenantId: string }>(rows: readonly R[], id: string) => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`Missing record ${id}`);
  return row.tenantId;
};

const lsAr = staffId(PERSON.lsArjun);
const rvAm = staffId(PERSON.rvAmira);
const rvTm = staffId(PERSON.rvTom);
const nbEl = staffId(PERSON.nbElena);
const axMn = staffId(PERSON.axMeena);
const hmDn = staffId(PERSON.hmDaniel);

interface AsgO {
  asm?: string;
  rub?: string;
  max?: number;
  late?: string;
  grp?: boolean;
  peer?: string;
  orig?: boolean;
}

const asg = (
  id: string,
  cs: string,
  title: string,
  outs: string[],
  kinds: C.SubmissionKind[],
  win: readonly [string, string, C.AssignmentStatus, string],
  o: AsgO = {},
): C.Assignment => ({
  id,
  tenantId: tenantOf(COURSE_SPACES, cs),
  courseSpaceId: cs,
  title,
  instructions: `Complete and submit: ${title}.`,
  outcomeIds: outs,
  assessmentId: o.asm ?? null,
  rubricId: o.rub ?? null,
  maxMarks: o.max ?? null,
  submissionKinds: kinds,
  openAt: z(win[0]),
  dueAt: z(win[1]),
  lateUntil: o.late ? z(o.late) : null,
  groupWork: o.grp ?? false,
  peerReview: o.peer ? { reviewsPerSubmission: 1, anonymous: true, dueAt: z(o.peer) } : null,
  originalityCheck: o.orig ?? false,
  status: win[2],
  createdByStaffProfileId: win[3],
  ...ts,
});

export const ASSIGNMENTS: readonly C.Assignment[] = [
  asg(
    AG.lsStoryPhoto,
    CS.lsStory,
    "Story Picture Show-and-Tell",
    [O.lsLang1],
    ["photo", "audio"],
    ["07-06T04", "07-13T12", "published", lsAr],
  ),
  asg(
    AG.rvFracPractice,
    CS.rvY5Math,
    "Equivalent Fractions Set",
    [O.rvMathFrac],
    ["text", "file", "photo"],
    ["09-14T08", "09-25T16", "published", rvAm],
    { asm: ASSESSMENT.rv[0], rub: RUBRIC.rv, max: 20, late: "09-28T16" },
  ),
  asg(
    AG.rvEssayPeer,
    CS.rvY9Eng,
    "Argumentative Essay & Peer Review",
    [O.rvEngWrite],
    ["text", "file"],
    ["09-07T08", "09-18T16", "closed", rvTm],
    { asm: ASSESSMENT.rv[1], rub: RUBRIC.rv, max: 30, late: "09-20T16", peer: "09-25T16" },
  ),
  asg(
    AG.nbAlgoLab,
    CS.nbCs101,
    "Modular Control-Flow Lab Report",
    [O.nbCo1, O.nbCo2],
    ["text", "file", "link"],
    ["09-04T13", "09-24T16", "published", nbEl],
    { asm: ASSESSMENT.nb[0], rub: RUBRIC.nb, max: 50, late: "09-27T16", grp: true, orig: true },
  ),
  asg(
    AG.axQuadSheet,
    CS.axAlgebra,
    "Quadratic Roots Solutions",
    [O.axAlgQuad],
    ["file", "photo"],
    ["09-22T04", "09-29T14", "draft", axMn],
    { max: 25 },
  ),
  asg(
    AG.hmScaleRec,
    CS.hmPiano,
    "Major Scales Tempo Recording",
    [O.hmGrade1],
    ["audio"],
    ["06-01T01", "06-15T12", "archived", hmDn],
    { asm: ASSESSMENT.hm[0], rub: RUBRIC.hm, max: 10, late: "06-18T12" },
  ),
];

interface SubO {
  g?: string[];
  t?: string;
  f?: C.SubmissionFile[];
  u?: string;
}

const sub = (
  id: string,
  assignmentId: string,
  learnerId: string,
  status: C.SubmissionStatus,
  subAt: string | null,
  seq: number,
  o: SubO = {},
): C.AssignmentSubmission => ({
  id,
  tenantId: tenantOf(ASSIGNMENTS, assignmentId),
  assignmentId,
  learnerId,
  groupLearnerIds: o.g ?? [],
  attempt: 1,
  status,
  text: o.t ?? null,
  files: o.f ?? [],
  linkUrl: o.u ?? null,
  submittedAt: subAt ? z(subAt) : null,
  clientId: subUuid(seq),
  deviceId: null,
  ...ts,
});

export const ASSIGNMENT_SUBMISSIONS: readonly C.AssignmentSubmission[] = [
  sub(SB.lsKavyaPhoto, AG.lsStoryPhoto, L.lsKavya, "submitted", "07-10T06", 1, {
    f: [f("story-drawing.jpg", "image/jpeg", 245_000)],
  }),
  sub(SB.rvMiaFrac, AG.rvFracPractice, L.rvMia, "returned", "09-16T15:10", 2, {
    t: "1/2 = 2/4 = 4/8; 1/4 + 1/2 = 3/4.",
    f: [f("fraction-steps.pdf", "application/pdf", 82_400)],
  }),
  sub(SB.rvEllaEssay, AG.rvEssayPeer, L.rvElla, "returned", "09-17T14:30", 3, {
    t: "Local energy storage aids microgrids.",
    f: [f("grid-argument.pdf", "application/pdf", 118_000)],
  }),
  sub(SB.rvOliverEssay, AG.rvEssayPeer, L.rvOliver, "late", "09-19T11:20", 4, {
    t: "Public libraries remain vital study spaces.",
  }),
  sub(SB.nbJordanLab, AG.nbAlgoLab, L.nbJordan, "returned", "09-14T18:45", 5, {
    g: [L.nbSofia],
    t: "Loop invariant proofs attached.",
    f: [f("cs101-lab-report.pdf", "application/pdf", 312_000)],
    u: "https://repos.example.edu/cs101/lab-one",
  }),
  sub(SB.nbAidenLab, AG.nbAlgoLab, L.nbAiden, "resubmission_requested", "09-15T16", 6, {
    t: "Initial loop draft without edge-case tests.",
  }),
  sub(SB.hmEthanScale, AG.hmScaleRec, L.hmEthan, "returned", "06-12T08", 7, {
    f: [f("c-major-scale.mp3", "audio/mpeg", 1_420_000)],
  }),
  sub(SB.hmChloeDraft, AG.hmScaleRec, L.hmChloe, "draft", null, 8),
];

const fb = (
  id: string,
  submissionId: string,
  marks: number | null,
  r: readonly [number, number],
  comment: string,
  staff: string,
  mAt: string,
  rAt: string,
): C.SubmissionFeedback => ({
  id,
  tenantId: tenantOf(ASSIGNMENT_SUBMISSIONS, submissionId),
  submissionId,
  marks,
  rubricScores: rub(r[0], r[1]),
  comment,
  markedByStaffProfileId: staff,
  markedAt: z(mAt),
  releasedAt: z(rAt),
});

export const SUBMISSION_FEEDBACK: readonly C.SubmissionFeedback[] = [
  fb(FB.rvMiaFrac, SB.rvMiaFrac, 18, [3, 3], "Clear steps.", rvAm, "09-17T10", "09-17T12"),
  fb(FB.rvEllaEssay, SB.rvEllaEssay, 26, [3, 2], "Good thesis.", rvTm, "09-18T17", "09-19T09"),
  fb(FB.nbJordanLab, SB.nbJordanLab, 46, [3, 3], "Solid proofs.", nbEl, "09-15T15", "09-15T16"),
  fb(FB.nbAidenLab, SB.nbAidenLab, null, [2, 1], "Add tests.", nbEl, "09-16T14", "09-16T15"),
  fb(FB.hmEthanScale, SB.hmEthanScale, 9, [3, 3], "Even tempo.", hmDn, "06-13T09", "06-13T10"),
];

const sug = (
  id: string,
  submissionId: string,
  tier: C.CapabilityTier,
  marks: number,
  r: readonly [number, number],
  reason: string,
  cAt: string,
  dec?: readonly [C.AiSuggestionDecision, string, string],
): C.AiMarkingSuggestion => ({
  id,
  tenantId: tenantOf(ASSIGNMENT_SUBMISSIONS, submissionId),
  submissionId,
  aiGenerated: true,
  tier,
  suggestedMarks: marks,
  suggestedRubricScores: rub(r[0], r[1]),
  reasons: [reason],
  createdAt: z(cAt),
  decision: dec?.[0] ?? "pending",
  decidedByStaffProfileId: dec?.[1] ?? null,
  decidedAt: dec ? z(dec[2]) : null,
});

const acRv = ["accepted", rvAm, "09-17T10"] as const;
const edRv = ["edited", rvTm, "09-18T17"] as const;
const rjNb = ["rejected", nbEl, "09-15T15"] as const;

export const AI_MARKING_SUGGESTIONS: readonly C.AiMarkingSuggestion[] = [
  sug(AM.rvMiaAccepted, SB.rvMiaFrac, "balanced", 18, [3, 3], "Matches key.", "09-16T16", acRv),
  sug(AM.rvEllaEdited, SB.rvEllaEssay, "reasoning", 23.5, [2, 2], "Brief.", "09-17T15", edRv),
  sug(AM.nbJordanRejected, SB.nbJordanLab, "reasoning", 38, [2, 2], "Unread.", "09-14T19", rjNb),
  sug(AM.rvOliverPending, SB.rvOliverEssay, "balanced", 21, [2, 2], "Cite.", "09-19T12"),
];

export const PEER_REVIEWS: readonly C.PeerReview[] = (
  [
    [PR.rvOliverOnElla, SB.rvEllaEssay, L.rvOliver, "09-21T10:30", "Clear thesis; add counter."],
    [PR.rvEllaOnOliver, SB.rvOliverEssay, L.rvElla, null, null],
  ] as readonly (readonly [string, string, string, string | null, string | null])[]
).map(([id, submissionId, reviewerLearnerId, at, comment]) => ({
  id,
  tenantId: T.riverside,
  assignmentId: AG.rvEssayPeer,
  submissionId,
  reviewerLearnerId,
  anonymous: true,
  status: at ? "submitted" : "assigned",
  rubricScores: at ? rub(3, 2) : null,
  comment,
  submittedAt: at ? z(at) : null,
}));

export const ORIGINALITY_SIGNALS: readonly C.OriginalitySignal[] = (
  [
    [OR.nbJordanReady, SB.nbJordanLab, "sim-demo-nb-001", 820, "09-14T19:05"],
    [OR.nbAidenPending, SB.nbAidenLab, "sim-demo-nb-002", null, null],
  ] as readonly (readonly [string, string, string, number | null, string | null])[]
).map(([id, submissionId, externalId, bps, at]) => ({
  id,
  tenantId: T.northbridge,
  submissionId,
  provider: "demo_similarity",
  status: bps !== null ? "ready" : "pending",
  similarityBps: bps,
  externalId,
  checkedAt: at ? z(at) : null,
}));
