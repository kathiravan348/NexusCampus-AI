import type * as C from "@nexus/contracts";
import { PERSON, TENANT as T } from "./ids";
import { LEARNER as L } from "./ids-stage3";
import {
  ONLINE_TEST as OT,
  QUESTION_ITEM as QI,
  TEST_ATTEMPT as TA,
  TEST_RESPONSE as TR,
} from "./ids-stage4-assess";
import { ROLE_PROFILES } from "./role-profiles";

const z = (s: string): string => (s.length === 8 ? `2026-${s}:00:00Z` : `2026-${s}:00Z`);
const attUuid = (n: number): string => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
const stf = (personId: string): string => {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === "staff");
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
};
const nbEl = stf(PERSON.nbElena);

type AttRow = readonly [
  string,
  string,
  string,
  string,
  C.TestAttempt["status"],
  string,
  string | null,
  number | null,
  number,
];

export const TEST_ATTEMPTS: readonly C.TestAttempt[] = (
  [
    [
      TA.rvMiaPractice,
      T.riverside,
      OT.rvFracQuiz,
      L.rvMia,
      "released",
      "09-16T09",
      "09-16T09:44",
      6,
      6,
    ],
    [
      TA.nbJordanMid,
      T.northbridge,
      OT.nbCsMidterm,
      L.nbJordan,
      "marked",
      "09-12T14",
      "09-12T14:38",
      13,
      14,
    ],
    [
      TA.nbSofiaMid,
      T.northbridge,
      OT.nbCsMidterm,
      L.nbSofia,
      "submitted",
      "09-12T14",
      "09-12T14:42",
      null,
      14,
    ],
    [TA.axVijayMock, T.apex, OT.axMock, L.axVijay, "released", "09-16T05", "09-16T05:52", 3, 12],
    [
      TA.axDivyaMock,
      T.apex,
      OT.axMock,
      L.axDivya,
      "auto_submitted",
      "09-17T05",
      "09-17T06",
      -2,
      12,
    ],
    [
      TA.hmRachelTheory,
      T.harmony,
      OT.hmTheoryCheck,
      L.hmRachel,
      "in_progress",
      "06-15T06",
      null,
      null,
      2,
    ],
  ] as readonly AttRow[]
).map(([id, tenantId, testId, learnerId, status, st, sub, scorePoints, maxPoints], i) => ({
  id,
  tenantId,
  testId,
  learnerId,
  attemptNumber: 1,
  status,
  startedAt: z(st),
  submittedAt: sub ? z(sub) : null,
  scorePoints,
  maxPoints,
  clientId: attUuid(i + 1),
  deviceId: null,
}));

interface RO {
  s?: string[];
  t?: string;
  n?: number;
  a?: number;
  m?: number;
  by?: string;
  fl?: boolean;
}

const r = (id: string, attemptId: string, itemId: string, at: string, o: RO): C.TestResponse => {
  const att = TEST_ATTEMPTS.find((row) => row.id === attemptId);
  if (!att) throw new Error(`Missing attempt ${attemptId}`);
  return {
    id,
    tenantId: att.tenantId,
    attemptId,
    itemId,
    selectedOptionIds: o.s ?? [],
    textAnswer: o.t ?? null,
    numericAnswer: o.n ?? null,
    autoScore: o.a ?? null,
    manualScore: o.m ?? null,
    markedByStaffProfileId: o.by ?? null,
    flagged: o.fl ?? false,
    answeredAt: z(at),
  };
};

export const TEST_RESPONSES: readonly C.TestResponse[] = [
  r(TR.rvMiaChoice, TA.rvMiaPractice, QI.rvFracChoice, "09-16T09:33", { s: ["A"], a: 2 }),
  r(TR.rvMiaTf, TA.rvMiaPractice, QI.rvFracTf, "09-16T09:36", { s: ["T"], a: 1 }),
  r(TR.rvMiaOrder, TA.rvMiaPractice, QI.rvFracOrder, "09-16T09:41", {
    s: ["O1", "O2", "O3"],
    a: 3,
  }),
  r(TR.nbJordanMulti, TA.nbJordanMid, QI.nbLoopMulti, "09-12T14:12", { s: ["A", "B"], a: 4 }),
  r(TR.nbJordanEssay, TA.nbJordanMid, QI.nbTestEssay, "09-12T14:35", {
    t: "Boundary inputs verify loop index bounds.",
    m: 9,
    by: nbEl,
  }),
  r(TR.nbSofiaMulti, TA.nbSofiaMid, QI.nbLoopMulti, "09-12T14:16", { s: ["A", "B"], a: 4 }),
  r(TR.nbSofiaEssay, TA.nbSofiaMid, QI.nbTestEssay, "09-12T14:39", {
    t: "Checks first and last loop iterations.",
    fl: true,
  }),
  r(TR.axVijayQuad, TA.axVijayMock, QI.axQuadMcq, "09-16T05:15", { s: ["A"], a: 4 }),
  r(TR.axVijayNum, TA.axVijayMock, QI.axQuadNumeric, "09-16T05:32", { n: 4, a: -1, fl: true }),
  r(TR.axDivyaQuad, TA.axDivyaMock, QI.axQuadMcq, "09-17T05:20", { s: ["B"], a: -1 }),
  r(TR.axDivyaMech, TA.axDivyaMock, QI.axMechMcq, "09-17T05:45", { s: ["A"], a: -1 }),
  r(TR.hmRachelShort, TA.hmRachelTheory, QI.hmKeyShort, "06-15T06:04", { t: "G major" }),
];

type StRow = readonly [
  string,
  string,
  string | null,
  number,
  number,
  number,
  Record<string, number>,
  string,
];

export const ITEM_STATISTICS: readonly C.ItemStatistic[] = (
  [
    [
      T.riverside,
      QI.rvFracChoice,
      OT.rvFracQuiz,
      24,
      7500,
      0.42,
      { A: 18, B: 3, C: 2, D: 1 },
      "09-18T12",
    ],
    [
      T.northbridge,
      QI.nbLoopMulti,
      OT.nbCsMidterm,
      40,
      6500,
      0.51,
      { A: 34, B: 30, C: 8, D: 4 },
      "09-17T12",
    ],
    [T.apex, QI.axQuadMcq, OT.axMock, 20, 6000, 0.48, { A: 12, B: 5, C: 2, D: 1 }, "09-18T12"],
    [T.apex, QI.axMechMcq, null, 20, 5500, 0.39, { A: 4, B: 11, C: 3, D: 2 }, "09-18T12"],
  ] as readonly StRow[]
).map(([tenantId, itemId, testId, responses, facilityBps, discrimination, optionCounts, at]) => ({
  tenantId,
  itemId,
  testId,
  responses,
  facilityBps,
  discrimination,
  optionCounts,
  computedAt: z(at),
}));
