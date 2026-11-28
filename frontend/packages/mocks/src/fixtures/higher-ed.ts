import type * as C from "@nexus/contracts";
import { ACADEMIC_CALENDARS } from "./calendars";
import { CALENDAR, PERSON, TENANT } from "./ids";
import {
  LEARNER as L,
  OFFERING as OFF,
  PROGRAM,
  SUBJECT as S,
  YEAR_LEVEL as YL,
} from "./ids-stage3";
import { ORIGINALITY_SIGNAL } from "./ids-stage4-assess";
import {
  DEGREE_AUDIT as AUD,
  ELECTIVE_CLIENT as ELC,
  ELECTIVE_REGISTRATION as ELR,
  PATH_ADVICE as ADV,
  PROGRAM_REQUIREMENT as REQ,
  REGISTRATION_WINDOW as WIN,
  THESIS as THS,
} from "./ids-stage4-store";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const tenantId = TENANT.northbridge;
const programId = PROGRAM.northbridge;
const academicYearId = CALENDAR.northbridge;
const at = (s: string) => (s.length === 11 ? `20${s}:00:00Z` : `20${s}:00Z`);
const cal = ACADEMIC_CALENDARS.find((row) => row.id === academicYearId);
const [fallPeriod, springPeriod] = cal?.periods ?? [];
if (!cal || !fallPeriod || !springPeriod) throw new Error("Missing Northbridge calendar periods");

function staffId(personId: string): string {
  const row = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === personId && p.kind === "staff",
  );
  if (!row) throw new Error(`Missing Northbridge staff profile for ${personId}`);
  return row.id;
}

const rb = staffId(PERSON.nbRobert);
const el = staffId(PERSON.nbElena);
const mc = staffId(PERSON.nbMarcus);
const fallId = fallPeriod.id;
const springId = springPeriod.id;
const coreSubs = [S.nbProgramming, S.nbComputingMath];
const elecSubs = [S.nbDatabases, S.nbSystems];

const req = (
  id: string,
  name: string,
  category: C.RequirementCategory,
  creditSystem: C.CreditSystem,
  minCredits: number,
  maxCredits: number | null,
  subjectIds: readonly string[],
): C.ProgramRequirement => ({
  id,
  tenantId,
  programId,
  name,
  category,
  creditSystem,
  minCredits,
  maxCredits,
  subjectIds: [...subjectIds],
  effectiveFromYearId: academicYearId,
});

export const PROGRAM_REQUIREMENTS: readonly C.ProgramRequirement[] = [
  req(REQ.nbCore, "Computing Core", "core", "semester_hours", 6, 12, coreSubs),
  req(REQ.nbElectives, "Systems Electives", "elective", "semester_hours", 6, 9, elecSubs),
  req(REQ.nbProject, "Honours Capstone", "project", "ects", 6, null, [S.nbSystems]),
];

const win = (
  id: string,
  yearLevelId: string | null,
  periodId: string,
  opensAt: string,
  closesAt: string,
  minCredits: number,
  maxCredits: number,
  status: C.RegistrationWindow["status"],
): C.RegistrationWindow => ({
  id,
  tenantId,
  programId,
  yearLevelId,
  academicYearId,
  periodId,
  opensAt: at(opensAt),
  closesAt: at(closesAt),
  minCredits,
  maxCredits,
  status,
});

export const REGISTRATION_WINDOWS: readonly C.RegistrationWindow[] = [
  win(WIN.nbFallClosed, YL.nbFirstYear, fallId, "26-08-25T13", "26-09-04T21", 6, 18, "closed"),
  win(WIN.nbSpringOpen, YL.nbSecondYear, springId, "26-11-16T13", "26-12-04T21", 6, 18, "open"),
  win(WIN.nbSpringDraft, null, springId, "27-01-19T13", "27-01-29T21", 3, 12, "draft"),
];

const reg = (
  key: keyof typeof ELR,
  windowId: string,
  learnerId: string,
  offerings: readonly string[],
  status: C.ElectiveRegistrationStatus,
  submittedAt: string,
  decided?: readonly [string, string],
): C.ElectiveRegistration => ({
  id: ELR[key],
  tenantId,
  windowId,
  learnerId,
  choices: offerings.map((subjectOfferingId, idx) => ({ subjectOfferingId, priority: idx + 1 })),
  status,
  decidedByStaffProfileId: decided?.[0] ?? null,
  decidedAt: decided ? at(decided[1]) : null,
  clientId: ELC[key],
  submittedAt: at(submittedAt),
});

const w1 = WIN.nbFallClosed;
const w2 = WIN.nbSpringOpen;
const o1 = OFF.nbFirstYear;
const o2 = OFF.nbSecondYear;
export const ELECTIVE_REGISTRATIONS: readonly C.ElectiveRegistration[] = [
  reg("nbConfirmed", w1, L.nbJordan, o1, "confirmed", "26-08-26T14", [el, "26-09-02T15"]),
  reg("nbRejected", w1, L.nbSofia, [o2[0]], "rejected", "26-08-27T14:30", [el, "26-09-03T16"]),
  reg("nbSubmitted", w2, L.nbAiden, o2, "submitted", "26-11-18T14"),
  reg("nbWaitlisted", w2, L.nbNora, [o2[1]], "waitlisted", "26-11-19T15:30"),
  reg("nbWithdrawn", w2, L.nbJordan, [o2[0]], "withdrawn", "26-11-20T16"),
];

const audit = (
  id: string,
  learnerId: string,
  computedAt: string,
  gpa: number,
  rows: readonly (readonly [string, number, number])[],
): C.DegreeAudit => {
  const requirements = rows.map(([requirementId, creditsEarned, creditsRequired]) => ({
    requirementId,
    creditsEarned,
    creditsRequired,
    satisfied: creditsEarned >= creditsRequired,
  }));
  const creditsEarned = requirements.reduce((n, r) => n + r.creditsEarned, 0);
  const creditsRequired = requirements.reduce((n, r) => n + r.creditsRequired, 0);
  return {
    id,
    tenantId,
    learnerId,
    programId,
    computedAt: at(computedAt),
    creditsEarned,
    creditsRequired,
    gpa,
    gpaScale: 4,
    requirements,
    eligibleToGraduate: requirements.every((r) => r.satisfied) && creditsEarned >= creditsRequired,
  };
};

export const DEGREE_AUDITS: readonly C.DegreeAudit[] = [
  audit(AUD.nbAidenProgress, L.nbAiden, "26-11-20T12", 3.6, [
    [REQ.nbCore, 6, 6],
    [REQ.nbElectives, 6, 6],
    [REQ.nbProject, 0, 6],
  ]),
  audit(AUD.nbNoraEligible, L.nbNora, "26-11-21T12", 3.85, [
    [REQ.nbCore, 6, 6],
    [REQ.nbElectives, 6, 6],
    [REQ.nbProject, 6, 6],
  ]),
];

interface ThesisOpts {
  dueOn: string;
  doneOn?: string;
  milestone: string;
  examiner?: string;
  signalId?: string;
}

const thesis = (
  id: string,
  learnerId: string,
  title: string,
  supervisors: readonly string[],
  stage: C.ThesisStage,
  o: ThesisOpts,
): C.Thesis => ({
  id,
  tenantId,
  learnerId,
  title,
  supervisorStaffProfileIds: [...supervisors],
  stage,
  milestones: [{ name: o.milestone, dueOn: o.dueOn, completedOn: o.doneOn ?? null }],
  externalExaminerName: o.examiner ?? null,
  originalitySignalId: o.signalId ?? null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
});

const sig = ORIGINALITY_SIGNAL.nbJordanReady;
export const THESES: readonly C.Thesis[] = [
  thesis(THS.nbProposal, L.nbSofia, "Queue Scheduler Verification", [el], "proposal", {
    milestone: "Problem statement",
    dueOn: "2026-10-15",
  }),
  thesis(THS.nbInProgress, L.nbAiden, "Columnar Storage Compression", [mc], "in_progress", {
    milestone: "Literature review",
    dueOn: "2026-10-01",
    doneOn: "2026-09-29",
  }),
  thesis(THS.nbSubmitted, L.nbJordan, "Loop Invariant Synthesis", [el, mc], "submitted", {
    milestone: "Draft submission",
    dueOn: "2026-11-10",
    doneOn: "2026-11-09",
    signalId: sig,
  }),
  thesis(THS.nbUnderExam, L.nbNora, "Memory Safety Diagnostics", [mc], "under_examination", {
    milestone: "Final manuscript",
    dueOn: "2026-11-05",
    doneOn: "2026-11-04",
    examiner: "Dr. Claire Bennett",
  }),
  thesis(THS.nbRevisions, L.nbAiden, "Query Plan Visualisation", [el], "revisions", {
    milestone: "Examiner response",
    dueOn: "2027-03-10",
    examiner: "Dr. Samuel Ortiz",
  }),
  thesis(THS.nbAccepted, L.nbNora, "Fault Injection Benchmarks", [rb, el], "accepted", {
    milestone: "Deposit copy",
    dueOn: "2027-04-20",
    doneOn: "2027-04-18",
    examiner: "Prof. Hannah Cho",
  }),
  thesis(THS.nbWithdrawn, L.nbSofia, "Graph Partitioning Study", [rb], "withdrawn", {
    milestone: "Scope review",
    dueOn: "2026-09-18",
  }),
];

export const PATH_ADVICE: readonly C.PathAdvice[] = [
  {
    id: ADV.nbDraft,
    tenantId,
    learnerId: L.nbJordan,
    aiGenerated: true,
    tier: "reasoning",
    suggestions: [
      { subjectId: S.nbDatabases, reason: "Advances the systems elective requirement." },
    ],
    warnings: ["Confirm prerequisites with your academic advisor before registering."],
    status: "draft",
    reviewedByStaffProfileId: null,
    reviewedAt: null,
    createdAt: at("26-11-15T14"),
  },
  {
    id: ADV.nbReviewed,
    tenantId,
    learnerId: L.nbAiden,
    aiGenerated: true,
    tier: "balanced",
    suggestions: [
      { subjectId: S.nbSystems, reason: "Completes the capstone project credit block." },
    ],
    warnings: [],
    status: "reviewed",
    reviewedByStaffProfileId: mc,
    reviewedAt: at("26-11-17T16:30"),
    createdAt: at("26-11-16T13"),
  },
];
