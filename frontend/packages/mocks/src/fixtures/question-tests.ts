import type * as C from "@nexus/contracts";
import { COURSE_SPACES } from "./courses";
import { INSTITUTION as I, PERSON, TENANT as T } from "./ids";
import { ASSESSMENT, SUBJECT as SUB } from "./ids-stage3";
import {
  ONLINE_TEST as OT,
  QUESTION_BANK as QB,
  QUESTION_ITEM as QI,
  TEST_SECTION as TS,
} from "./ids-stage4-assess";
import { COURSE_SPACE as CS, OUTCOME as O } from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };
const z = (s: string): string => (s.length === 8 ? `2026-${s}:00:00Z` : `2026-${s}:00Z`);
const opts = (...rows: string[]): C.QuestionOption[] =>
  rows.map((s) => {
    const [id = "", raw = ""] = s.split(":");
    const correct = raw.endsWith("*");
    return { id, text: correct ? raw.slice(0, -1) : raw, correct };
  });
const stf = (personId: string): string => {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "staff");
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
};
const byId = <R extends { id: string }>(rows: readonly R[], id: string): R => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`Missing record ${id}`);
  return row;
};

const LOC: Record<string, C.Locale> = {
  [QB.rvMath]: "en-GB",
  [QB.nbCs]: "en-US",
  [QB.axStem]: "en-IN",
  [QB.hmMusic]: "en-SG",
};
const bk = (
  id: string,
  tenantId: string,
  institutionId: string | null,
  code: string,
  name: string,
  subjectIds: string[],
  eds: string[],
): C.QuestionBank => ({
  id,
  tenantId,
  institutionId,
  code,
  name,
  subjectIds,
  editorStaffProfileIds: eds.map(stf),
  ...ts,
});

export const QUESTION_BANKS: readonly C.QuestionBank[] = [
  bk(
    QB.rvMath,
    T.riverside,
    null,
    "RV-MATH",
    "Riverside Maths",
    [SUB.rvMaths],
    [PERSON.rvAmira, PERSON.rvTom],
  ),
  bk(
    QB.nbCs,
    T.northbridge,
    I.northbridge,
    "NB-CS",
    "Northbridge CS",
    [SUB.nbProgramming, SUB.nbDatabases],
    [PERSON.nbElena, PERSON.nbMarcus],
  ),
  bk(
    QB.axStem,
    T.apex,
    I.apex,
    "AX-STEM",
    "Apex STEM Bank",
    [SUB.axAlgebra, SUB.axMechanics],
    [PERSON.axMeena, PERSON.axSuresh],
  ),
  bk(
    QB.hmMusic,
    T.harmony,
    I.harmony,
    "HM-MUS",
    "Harmony Theory",
    [SUB.hmTheory, SUB.hmEarTraining],
    [PERSON.hmDaniel, PERSON.hmPriya],
  ),
];

interface QO {
  opts?: C.QuestionOption[];
  ans?: string[];
  num?: { value: number; tolerance: number };
  neg?: number;
  diff?: C.QuestionItem["difficulty"];
  exp?: string;
  src?: C.QuestionItem["source"];
  st?: C.QuestionItem["status"];
  by?: string;
}

const qi = (
  id: string,
  bankId: string,
  kind: C.QuestionItem["kind"],
  stem: string,
  maxPoints: number,
  outcomeId: string,
  o: QO = {},
): C.QuestionItem => {
  const bank = byId(QUESTION_BANKS, bankId);
  const author = o.by ? stf(o.by) : bank.editorStaffProfileIds[0];
  if (!author) throw new Error(`Missing editor for ${bankId}`);
  return {
    id,
    tenantId: bank.tenantId,
    bankId,
    kind,
    stem,
    language: LOC[bankId] ?? "en-GB",
    options: o.opts ?? [],
    acceptedAnswers: o.ans ?? [],
    numericAnswer: o.num ?? null,
    maxPoints,
    negativePoints: o.neg ?? 0,
    difficulty: o.diff ?? "medium",
    outcomeIds: [outcomeId],
    qtiIdentifier: `qti-${id}`,
    explanation: o.exp ?? null,
    source: o.src ?? "manual",
    status: o.st ?? "approved",
    version: 1,
    createdByProfileId: author,
    ...ts,
  };
};

export const QUESTION_ITEMS: readonly C.QuestionItem[] = [
  qi(QI.rvFracChoice, QB.rvMath, "single_choice", "Which fraction equals 1/2?", 2, O.rvMathFrac, {
    diff: "easy",
    opts: opts("A:2/4*", "B:2/3", "C:3/5", "D:1/3"),
    exp: "Multiply top and bottom of 1/2 by 2 to get 2/4.",
  }),
  qi(QI.rvFracTf, QB.rvMath, "true_false", "3/6 and 4/8 equal the same value.", 1, O.rvMathFrac, {
    diff: "easy",
    opts: opts("T:True*", "F:False"),
  }),
  qi(QI.rvFracOrder, QB.rvMath, "order", "Order fractions smallest to largest.", 3, O.rvMathFrac, {
    opts: opts("O1:1/4", "O2:1/2", "O3:3/4"),
  }),
  qi(QI.rvAlgAiReview, QB.rvMath, "short_text", "Name m in y = mx + c.", 2, O.rvMathAlg, {
    ans: ["gradient", "slope"],
    src: "ai_generated",
    st: "in_review",
    by: PERSON.rvTom,
  }),
  qi(QI.nbLoopMulti, QB.nbCs, "multiple_choice", "Loop invariant properties?", 4, O.nbCo1, {
    opts: opts("A:Holds first*", "B:Preserved*", "C:Alters index", "D:Uses recursion"),
  }),
  qi(QI.nbTestEssay, QB.nbCs, "essay", "How do boundary tests catch loop bugs?", 10, O.nbCo2, {
    diff: "hard",
  }),
  qi(QI.axQuadMcq, QB.axStem, "single_choice", "Discriminant of x^2-5x+6=0?", 4, O.axAlgQuad, {
    neg: 1,
    opts: opts("A:1*", "B:25", "C:-1", "D:49"),
    exp: "b^2 - 4ac = 25 - 24 = 1.",
  }),
  qi(QI.axQuadNumeric, QB.axStem, "numeric", "Sum of roots of 2x^2-10x+8=0?", 4, O.axAlgQuad, {
    neg: 1,
    num: { value: 5, tolerance: 0.01 },
  }),
  qi(QI.axMechMcq, QB.axStem, "single_choice", "a=2 m/s^2 from rest for 5 s?", 4, O.axMechKin, {
    neg: 1,
    by: PERSON.axSuresh,
    opts: opts("A:5 m/s", "B:10 m/s*", "C:20 m/s", "D:25 m/s"),
  }),
  qi(QI.hmKeyShort, QB.hmMusic, "short_text", "Major key with one sharp?", 2, O.hmGrade3, {
    diff: "easy",
    ans: ["G major", "G"],
    by: PERSON.hmPriya,
  }),
];

const fx = (id: string, title: string, itemIds: string[]): C.TestSection => ({
  id,
  title,
  itemIds,
  pool: null,
});
const pl = (id: string, title: string, b: string[], o: string[], n: number): C.TestSection => ({
  id,
  title,
  itemIds: [],
  pool: { bankIds: b, outcomeIds: o, itemCount: n },
});
type Cfg = readonly [
  string,
  string,
  string | null,
  number,
  number | null,
  C.OnlineTest["showResults"],
  number,
  boolean,
  C.OnlineTest["status"],
];

const ot = (
  id: string,
  cs: string,
  title: string,
  mode: C.OnlineTest["mode"],
  sections: C.TestSection[],
  [open, close, asm, lim, att, res, bps, proc, status]: Cfg,
): C.OnlineTest => {
  const tenantId = byId(COURSE_SPACES, cs).tenantId;
  return {
    id,
    tenantId,
    courseSpaceId: cs,
    assessmentId: asm,
    title,
    mode,
    sections,
    timeLimitMinutes: lim,
    opensAt: z(open),
    closesAt: z(close),
    attemptsAllowed: att,
    shuffleOptions: mode !== "practice" || tenantId === T.riverside,
    showResults: res,
    passMarkBps: bps,
    proctored: proc,
    status,
    ...ts,
  };
};

const rvS = [fx(TS.rvFracFixed, "Core Fractions", [QI.rvFracChoice, QI.rvFracTf, QI.rvFracOrder])];
const nbS = [fx(TS.nbCsFixed, "Theory & Design", [QI.nbLoopMulti, QI.nbTestEssay])];
const axS = [
  fx(TS.axMockAlg, "Section A — Quadratics", [QI.axQuadMcq, QI.axQuadNumeric]),
  pl(TS.axMockPool, "Section B — Mechanics", [QB.axStem], [O.axMechKin], 1),
];
const adS = [pl(TS.axAdaptPool, "Adaptive Pool", [QB.axStem], [O.axAlgQuad, O.axMechKin], 3)];
const hmS = [fx(TS.hmTheoryFixed, "Major Keys", [QI.hmKeyShort])];

const [nbAsm] = ASSESSMENT.nb;
const [axAsm] = ASSESSMENT.ax;
const cRv: Cfg = ["09-14T08", "09-28T16", null, 20, null, "immediately", 6000, false, "open"];
const cNb: Cfg = ["09-10T13", "09-16T22", nbAsm, 45, 1, "manual", 7000, true, "closed"];
const cAx: Cfg = ["09-15T04", "09-30T15", axAsm, 60, 2, "after_close", 7000, true, "open"];
const cAd: Cfg = ["10-05T04", "10-20T15", null, 30, 3, "immediately", 6500, false, "scheduled"];
const cHm: Cfg = ["06-01T01", "12-15T12", null, 15, null, "immediately", 5000, false, "open"];

export const ONLINE_TESTS: readonly C.OnlineTest[] = [
  ot(OT.rvFracQuiz, CS.rvY5Math, "Fractions Practice", "practice", rvS, cRv),
  ot(OT.nbCsMidterm, CS.nbCs101, "CS101 Midterm", "graded", nbS, cNb),
  ot(OT.axMock, CS.axAlgebra, "STEM Timed Mock 1", "graded", axS, cAx),
  ot(OT.axAdaptive, CS.axAlgebra, "Adaptive Diagnostic", "adaptive", adS, cAd),
  ot(OT.hmTheoryCheck, CS.hmSightRead, "Key Self-Check", "practice", hmS, cHm),
];

export { ITEM_STATISTICS, TEST_ATTEMPTS, TEST_RESPONSES } from "./question-tests-attempts";
