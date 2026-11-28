import type {
  CapabilityTier,
  EngagementSnapshot,
  Intervention,
  InterventionKind,
  InterventionStatus,
  RiskFactor,
  RiskFactorCode,
  RiskFactorSource,
  RiskLevel,
  RiskReviewStatus,
  RiskScore,
} from "@nexus/contracts";
import { PERSON, TENANT as T } from "./ids";
import { LEARNER as L } from "./ids-stage3";
import { INTERVENTION as ITV, RISK_SCORE as RSK } from "./ids-stage4-assess";
import { COURSE_SPACE as CS } from "./ids-stage4-learning";
import { LEARNERS } from "./learner-records";
import { ROLE_PROFILES } from "./role-profiles";

const z = (s: string): string => `2026-${s}:00Z`;
const d = (s: string): string => `2026-${s}`;

function staffId(personId: string): string {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "staff");
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
}

const learnerTenant = (id: string): string => {
  const row = LEARNERS.find((l) => l.id === id);
  if (!row) throw new Error(`Missing learner ${id}`);
  return row.tenantId;
};

const S = {
  rvHelen: staffId(PERSON.rvHelen),
  rvTom: staffId(PERSON.rvTom),
  nbElena: staffId(PERSON.nbElena),
  axMeena: staffId(PERSON.axMeena),
  hmDaniel: staffId(PERSON.hmDaniel),
};

type SnapRow = readonly [
  string,
  string | null,
  string,
  string,
  readonly [number, number, number, number, number, number],
  readonly [number, number],
  string,
];

/** No Little Steps (EY) rows in early warning (NEX-221). */
export const ENGAGEMENT_SNAPSHOTS: readonly EngagementSnapshot[] = (
  [
    [L.rvOliver, null, "09-02", "09-18", [6, 95, 2, 1, 1, 1], [8400, 6800], "09-19T06:00"],
    [L.rvMia, CS.rvY5Math, "09-02", "09-18", [14, 260, 5, 3, 0, 0], [9800, 9100], "09-19T06:00"],
    [L.nbAiden, CS.nbCs101, "09-01", "09-16", [5, 110, 2, 1, 0, 2], [7900, 5900], "09-17T06:00"],
    [L.axDivya, CS.axAlgebra, "09-01", "09-17", [4, 75, 0, 0, 0, 2], [7600, 4200], "09-18T06:00"],
    [L.hmChloe, CS.hmPiano, "06-01", "06-15", [3, 40, 1, 0, 0, 1], [8800, 7400], "06-16T06:00"],
  ] as readonly SnapRow[]
).map(([learnerId, courseSpaceId, pStart, pEnd, c, bps, at]) => ({
  tenantId: learnerTenant(learnerId),
  learnerId,
  courseSpaceId,
  periodStart: d(pStart),
  periodEnd: d(pEnd),
  logins: c[0],
  activeMinutes: c[1],
  itemsCompleted: c[2],
  submissionsOnTime: c[3],
  submissionsLate: c[4],
  submissionsMissing: c[5],
  attendanceBps: bps[0],
  averageScoreBps: bps[1],
  computedAt: z(at),
}));

const rf = (
  code: RiskFactorCode,
  weightBps: number,
  detail: string,
  sourceModule: RiskFactorSource,
): RiskFactor => ({ code, weightBps, detail, sourceModule });

function rsk(
  id: string,
  tenantId: string,
  learnerId: string,
  tier: CapabilityTier,
  modelVersion: string,
  scoreBps: number,
  level: RiskLevel,
  factors: RiskFactor[],
  window: readonly [string, string],
  status: RiskReviewStatus,
  reviewedByStaffProfileId: string | null = null,
  reviewedAt: string | null = null,
  reviewNote: string | null = null,
): RiskScore {
  return {
    id,
    tenantId,
    learnerId,
    aiGenerated: true,
    tier,
    modelVersion,
    scoreBps,
    level,
    factors,
    computedAt: z(window[0]),
    validUntil: z(window[1]),
    status,
    reviewedByStaffProfileId,
    reviewedAt: reviewedAt ? z(reviewedAt) : null,
    reviewNote,
  };
}

export const RISK_SCORES: readonly RiskScore[] = [
  rsk(
    RSK.axDivyaHigh,
    T.apex,
    L.axDivya,
    "balanced",
    "ew-v1.2",
    8100,
    "high",
    [
      rf("low_scores", 4500, "Timed mock scored below threshold under negative marking.", "M33"),
      rf("low_engagement", 2500, "No completed items in Foundation Algebra over 17 days.", "M30"),
      rf("attendance_drop", 2000, "Attendance dipped to 76% in September batch sessions.", "M17"),
    ],
    ["09-18T06:00", "10-18T06:00"],
    "confirmed",
    S.axMeena,
    "09-18T09:00",
    "Confirmed after mock test result; scheduling small-group catch-up.",
  ),
  rsk(
    RSK.nbAidenMed,
    T.northbridge,
    L.nbAiden,
    "balanced",
    "ew-v1.2",
    6200,
    "medium",
    [
      rf("missing_work", 5000, "Two lab tasks missing or returned for resubmission.", "M32"),
      rf("attendance_drop", 3500, "Attendance fell below 80% during the first three weeks.", "M17"),
    ],
    ["09-17T06:00", "10-17T06:00"],
    "open",
  ),
  rsk(
    RSK.rvOliverLow,
    T.riverside,
    L.rvOliver,
    "fast",
    "ew-v1.2",
    3100,
    "low",
    [
      rf("late_work", 4000, "One English essay submitted one day past the due date.", "M32"),
      rf("low_engagement", 3000, "Fewer course space logins than the cohort median.", "M30"),
    ],
    ["09-19T06:00", "10-19T06:00"],
    "dismissed",
    S.rvTom,
    "09-19T14:00",
    "Late essay was pre-agreed for an inter-school fixture.",
  ),
  rsk(
    RSK.rvEllaExpired,
    T.riverside,
    L.rvElla,
    "balanced",
    "ew-v1.1",
    5400,
    "medium",
    [
      rf("score_decline", 4500, "Opening diagnostic score dropped relative to prior term.", "M20"),
      rf("low_engagement", 3500, "Only two course space visits during the opening week.", "M30"),
    ],
    ["09-03T06:00", "09-12T06:00"],
    "confirmed",
    S.rvTom,
    "09-04T09:00",
    "Early-term dip addressed via essay outline support.",
  ),
];

interface ItvIn {
  id: string;
  lrn: string;
  rsk: string | null;
  kind: InterventionKind;
  title: string;
  plan: string;
  owner: string;
  by: string;
  status: InterventionStatus;
  dates: readonly [string, string];
  outcome: string | null;
  ts: readonly [string, string];
}

const itv = (x: ItvIn): Intervention => ({
  id: x.id,
  tenantId: learnerTenant(x.lrn),
  learnerId: x.lrn,
  riskScoreId: x.rsk,
  kind: x.kind,
  title: x.title,
  plan: x.plan,
  ownerStaffProfileId: x.owner,
  createdByStaffProfileId: x.by,
  status: x.status,
  startOn: d(x.dates[0]),
  reviewOn: d(x.dates[1]),
  outcome: x.outcome,
  createdAt: z(x.ts[0]),
  updatedAt: z(x.ts[1]),
});

export const INTERVENTIONS: readonly Intervention[] = [
  itv({
    id: ITV.axDivyaTutoring,
    lrn: L.axDivya,
    rsk: RSK.axDivyaHigh,
    kind: "tutoring",
    title: "Foundation Algebra Catch-Up Clinics",
    plan: "Two 30-minute clinics on quadratic discriminants and pacing.",
    owner: S.axMeena,
    by: S.axMeena,
    status: "in_progress",
    dates: ["09-19", "10-03"],
    outcome: null,
    ts: ["09-18T09:15", "09-19T11:00"],
  }),
  itv({
    id: ITV.nbAidenMeeting,
    lrn: L.nbAiden,
    rsk: RSK.nbAidenMed,
    kind: "meeting",
    title: "CS101 Lab Office-Hour Check-In",
    plan: "Walk through missing boundary tests and agree weekly checkpoints.",
    owner: S.nbElena,
    by: S.nbElena,
    status: "planned",
    dates: ["09-21", "10-05"],
    outcome: null,
    ts: ["09-17T15:00", "09-17T15:00"],
  }),
  itv({
    id: ITV.rvEllaCompleted,
    lrn: L.rvElla,
    rsk: RSK.rvEllaExpired,
    kind: "learning_plan",
    title: "Thesis and Evidence Drafting Support",
    plan: "Guided outline check before the argumentative essay deadline.",
    owner: S.rvTom,
    by: S.rvHelen,
    status: "completed",
    dates: ["09-05", "09-14"],
    outcome: "Submitted argumentative essay on time and scored 26/30.",
    ts: ["09-04T09:30", "09-18T18:00"],
  }),
  itv({
    id: ITV.hmChloeCancelled,
    lrn: L.hmChloe,
    rsk: null,
    kind: "family_contact",
    title: "Practice Routine Family Check-In",
    plan: "Confirm home piano practice schedule ahead of Grade 1 check.",
    owner: S.hmDaniel,
    by: S.hmDaniel,
    status: "cancelled",
    dates: ["06-17", "06-24"],
    outcome: null,
    ts: ["06-16T08:00", "06-16T11:00"],
  }),
];
