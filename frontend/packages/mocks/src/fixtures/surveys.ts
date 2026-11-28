import type * as C from "@nexus/contracts";
import { INSTITUTION as I, PERSON as P, TENANT as T } from "./ids";
import { CLASS_GROUP as CG } from "./ids-stage3";
import {
  SURVEY as S,
  SURVEY_QUESTION as Q,
  SURVEY_RESPONSE as R,
  SURVEY_RESPONSE_CLIENT as RC,
  THEME_SUMMARY as TS,
} from "./ids-stage4-engage";
import { COURSE_SPACE as CS } from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const rv = T.riverside;
const nb = T.northbridge;
const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };
const instOf = { [rv]: I.riversideSchool, [nb]: I.northbridge } as const;
type EngageTenant = keyof typeof instOf;
const day = (d: string) => `2026-${d}T00:00:00Z`;
const at = (s: string) => (s.length === 8 ? `2026-${s}:00:00Z` : `2026-${s}:00Z`);

function pid(tenantId: EngageTenant, personId: string, kind: C.RoleProfileKind): string {
  const row = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === personId && p.kind === kind,
  );
  if (!row) throw new Error(`Missing ${kind} profile for ${personId}`);
  return row.id;
}

const rvHelen = pid(rv, P.rvHelen, "staff");
const rvTom = pid(rv, P.rvTom, "staff");
const rvAmira = pid(rv, P.rvAmira, "staff");
const rvGraceG = pid(rv, P.rvGrace, "guardian");
const rvAmiraG = pid(rv, P.rvAmira, "guardian");
const rvDanielG = pid(rv, P.rvDaniel, "guardian");
const nbRobert = pid(nb, P.nbRobert, "staff");
const nbElena = pid(nb, P.nbElena, "staff");

const qRate = (id: string, prompt: string): C.SurveyQuestion => ({
  type: "rating",
  id,
  prompt,
  required: true,
  scaleMax: 5,
});
const qPick = (
  type: "single_choice" | "multiple_choice",
  id: string,
  prompt: string,
  options: string[],
  required = true,
): C.SurveyQuestion => ({ type, id, prompt, required, options });
const qText = (id: string, prompt: string, required = false): C.SurveyQuestion => ({
  type: "text",
  id,
  prompt,
  required,
  maxLength: 500,
});

const survey = (
  id: string,
  tenantId: EngageTenant,
  title: string,
  meta: readonly [C.SurveyKind, C.Survey["audience"], C.Anonymity, C.Survey["status"]],
  win: readonly [string, string],
  createdByStaffProfileId: string,
  questions: C.SurveyQuestion[],
  o: { cg?: string[]; cs?: string[]; staff?: string; min?: number } = {},
): C.Survey => ({
  id,
  tenantId,
  institutionId: instOf[tenantId],
  title,
  kind: meta[0],
  audience: meta[1],
  targetClassGroupIds: o.cg ?? [],
  targetCourseSpaceIds: o.cs ?? [],
  subjectStaffProfileId: o.staff ?? null,
  anonymity: meta[2],
  minResponsesToShow: o.min ?? 5,
  opensAt: at(win[0]),
  closesAt: at(win[1]),
  status: meta[3],
  questions,
  createdByStaffProfileId,
  ...ts,
});

const OPTS = {
  course: ["Live walkthrough", "Written guide", "Pair lab"],
  topic: ["Loops", "Testing", "Debugging"],
  slot: ["Afternoon (16:00)", "Evening (18:00)", "Online call"],
  club: ["Reading club", "Chess club", "Robotics club"],
};

export const SURVEYS: readonly C.Survey[] = [
  survey(
    S.nbCourseFeedback,
    nb,
    "CS101 Lab Experience Check-in",
    ["course_feedback", "learners", "anonymous", "closed"],
    ["09-01T13", "09-14T23:59"],
    nbElena,
    [
      qRate(Q.nbCourseRating, "How clearly were the CS101 lab exercises explained?"),
      qPick("single_choice", Q.nbCourseFormat, "Which format helped you learn most?", OPTS.course),
      qPick("multiple_choice", Q.nbCourseTopics, "Which topics need practice?", OPTS.topic, false),
      qText(Q.nbCourseNotes, "What would improve the lab sessions next term?", true),
    ],
    { cg: [CG.nbFirstYear], cs: [CS.nbCs101] },
  ),
  survey(
    S.nbFacultyElena,
    nb,
    "CS101 Instructor Feedback",
    ["faculty_feedback", "learners", "anonymous", "closed"],
    ["09-02T13", "09-15T21"],
    nbRobert,
    [
      qRate(Q.nbFacClarity, "How well does the instructor check understanding during lectures?"),
      qText(Q.nbFacNotes, "Share constructive suggestions for class pacing or support."),
    ],
    { cg: [CG.nbFirstYear], cs: [CS.nbCs101], staff: nbElena },
  ),
  survey(
    S.rvStaffWellbeing,
    rv,
    "Autumn Term Staff Workload Pulse",
    ["staff", "staff", "confidential", "open"],
    ["09-07T08", "09-25T17"],
    rvHelen,
    [
      qRate(Q.rvStaffWorkload, "How manageable is your weekly planning workload?"),
      qText(Q.rvStaffSupport, "What practical support would help your team this term?"),
    ],
  ),
  survey(
    S.rvParentEvening,
    rv,
    "Parent Consultation Slot Preference",
    ["parent", "guardians", "named", "archived"],
    ["09-02T08", "09-09T18"],
    rvHelen,
    [qPick("single_choice", Q.rvParentSlot, "Which consultation slot suits best?", OPTS.slot)],
    { cg: [CG.rvSouthYearFive, CG.rvNorthYearTen], min: 3 },
  ),
  survey(
    S.rvGeneralLibrary,
    rv,
    "After-School Clubs Interest Poll",
    ["general", "learners", "anonymous", "draft"],
    ["10-05T08", "10-16T17"],
    rvAmira,
    [qPick("multiple_choice", Q.rvGeneralClubs, "Which clubs interest you?", OPTS.club)],
    { cg: [CG.rvSouthYearFive, CG.rvSouthYearSeven], cs: [CS.rvY5Eng] },
  ),
];

/** Faculty survey results are restricted to the subject staff member and their manager (A-4). */
export const FACULTY_RESULT_VIEWER_PROFILE_IDS: Readonly<Record<string, readonly string[]>> = {
  [S.nbFacultyElena]: [nbElena, nbRobert],
};

const ans = (questionId: string, patch: Partial<C.SurveyAnswer>): C.SurveyAnswer => ({
  questionId,
  rating: null,
  optionIndexes: [],
  text: null,
  ...patch,
});
const rate = (q: string, rating: number) => ans(q, { rating });
const pick = (q: string, optionIndexes: number[]) => ans(q, { optionIndexes });
const note = (q: string, text: string) => ans(q, { text });

const response = (
  key: keyof typeof R,
  tenantId: EngageTenant,
  surveyId: string,
  respondentProfileId: string | null,
  submittedAt: string,
  answers: C.SurveyAnswer[],
): C.SurveyResponse => ({
  id: R[key],
  tenantId,
  surveyId,
  respondentProfileId,
  anonymous: respondentProfileId === null,
  answers,
  submittedAt: respondentProfileId === null ? day(submittedAt) : at(submittedAt),
  clientId: RC[key],
  deviceId: null,
});

export const SURVEY_RESPONSES: readonly C.SurveyResponse[] = [
  ...(
    [
      ["nbCourse1", "09-04", 5, 0, [0, 1], "Worked loop traces made the lab tasks clear."],
      ["nbCourse2", "09-06", 4, 0, [1], "More unit-test starter cases would help before hand-in."],
      ["nbCourse3", "09-08", 5, 1, [0, 2], "Stepwise checklists made debugging much faster."],
      ["nbCourse4", "09-10", 4, 2, [1, 2], "Extra time on edge-case debugging would be helpful."],
      ["nbCourse5", "09-12", 4, 0, [0], "Clear worked examples at the start of every lab."],
    ] as const
  ).map(([k, d, r, f, t, n]) =>
    response(k, nb, S.nbCourseFeedback, null, d, [
      rate(Q.nbCourseRating, r),
      pick(Q.nbCourseFormat, [f]),
      pick(Q.nbCourseTopics, [...t]),
      note(Q.nbCourseNotes, n),
    ]),
  ),
  ...(
    [
      ["nbFac1", "09-05", 5, "Quick recap slides at the start keep everyone aligned."],
      ["nbFac2", "09-07", 5, "Pacing fits the syllabus and examples are easy to follow."],
      ["nbFac3", "09-09", 4, "Five extra minutes for questions at the end would help."],
      ["nbFac4", "09-11", 5, "Live checks for understanding keep lectures engaging."],
      ["nbFac5", "09-13", 4, "More Q&A buffer after difficult topics would be useful."],
    ] as const
  ).map(([k, d, r, n]) =>
    response(k, nb, S.nbFacultyElena, null, d, [rate(Q.nbFacClarity, r), note(Q.nbFacNotes, n)]),
  ),
  ...(
    [
      ["rvStaffTom", rvTom, "09-10T11:20", 3, "Shared lesson-plan templates save time."],
      ["rvStaffAmira", rvAmira, "09-11T15:05", 4, "Protected department planning slots help."],
    ] as const
  ).map(([k, who, when, r, n]) =>
    response(k, rv, S.rvStaffWellbeing, who, when, [
      rate(Q.rvStaffWorkload, r),
      note(Q.rvStaffSupport, n),
    ]),
  ),
  ...(
    [
      ["rvParentGrace", rvGraceG, "09-03T18:10", 0],
      ["rvParentAmira", rvAmiraG, "09-04T09:15", 1],
      ["rvParentDaniel", rvDanielG, "09-05T14:40", 2],
    ] as const
  ).map(([k, who, when, opt]) =>
    response(k, rv, S.rvParentEvening, who, when, [pick(Q.rvParentSlot, [opt])]),
  ),
];

type Dist = Record<string, number> | null;
type ResultTuple = readonly [string, string, number, number, Dist, number | null];
export const QUESTION_RESULTS: readonly C.QuestionResult[] = (
  [
    [S.nbCourseFeedback, Q.nbCourseRating, 5, 5, { "4": 3, "5": 2 }, 4.4],
    [S.nbCourseFeedback, Q.nbCourseFormat, 5, 5, { "0": 3, "1": 1, "2": 1 }, null],
    [S.nbFacultyElena, Q.nbFacClarity, 5, 5, { "4": 2, "5": 3 }, 4.6],
    [S.rvStaffWellbeing, Q.rvStaffWorkload, 5, 2, null, null],
    [S.rvParentEvening, Q.rvParentSlot, 3, 3, { "0": 1, "1": 1, "2": 1 }, null],
  ] as readonly ResultTuple[]
).map(([surveyId, questionId, minResponsesToShow, responseCount, distribution, average]) => ({
  surveyId,
  questionId,
  minResponsesToShow,
  responseCount,
  suppressed: responseCount < minResponsesToShow,
  distribution,
  average,
}));

const baseTheme = { tenantId: nb, aiGenerated: true as const, basedOnResponses: 5 };
export const THEME_SUMMARIES: readonly C.ThemeSummary[] = [
  {
    ...baseTheme,
    id: TS.nbCoursePublished,
    surveyId: S.nbCourseFeedback,
    questionId: Q.nbCourseNotes,
    tier: "balanced",
    themes: [
      { label: "Worked examples and guided checklists", mentionCount: 3, sentiment: "positive" },
      { label: "Additional debugging and test practice", mentionCount: 2, sentiment: "mixed" },
    ],
    summary: "Aggregate responses highlight clear worked lab guidance and request debugging time.",
    status: "published",
    publishedByStaffProfileId: nbElena,
    publishedAt: at("09-15T10"),
  },
  {
    ...baseTheme,
    id: TS.nbFacDraft,
    surveyId: S.nbFacultyElena,
    questionId: Q.nbFacNotes,
    tier: "reasoning",
    themes: [
      { label: "Session pacing and opening recaps", mentionCount: 3, sentiment: "neutral" },
      { label: "Short closing question window", mentionCount: 2, sentiment: "negative" },
    ],
    summary: "Aggregate responses note steady lecture pacing and suggest more closing Q&A time.",
    status: "draft",
    publishedByStaffProfileId: null,
    publishedAt: null,
  },
];
