import type * as C from "@nexus/contracts";
import { CLASS_GROUPS, SUBJECT_OFFERINGS } from "./academics";
import { ACADEMIC_CALENDARS } from "./calendars";
import { INSTITUTION as I, PERSON, TENANT as T } from "./ids";
import { LEARNER as L, OFFERING as OFF } from "./ids-stage3";
import { ASSESS_COURSE_ITEM as AI, ASSIGNMENT as AG, ONLINE_TEST as OT } from "./ids-stage4-assess";
import {
  CONTENT_ITEM as CI,
  COURSE_ITEM as IT,
  COURSE_MODULE as CM,
  COURSE_SPACE as CS,
  DISCUSSION_POST as DP,
  DISCUSSION_THREAD as DT,
  OUTCOME as O,
} from "./ids-stage4-learning";
import { LIVE_COURSE_ITEM as LI, LIVE_SESSION as LS } from "./ids-stage4-live";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };

function profileId(personId: string, kind: "staff" | "learner"): string {
  const row = ROLE_PROFILES.find((p) => p.personId === personId && p.kind === kind);
  if (!row) throw new Error(`Missing ${kind} profile for ${personId}`);
  return row.id;
}

const P = {
  rvAmira: profileId(PERSON.rvAmira, "staff"),
  rvMia: profileId(PERSON.rvMia, "learner"),
  nbElena: profileId(PERSON.nbElena, "staff"),
  nbJordan: profileId(PERSON.nbJordan, "learner"),
  nbSofia: profileId(PERSON.nbSofia, "learner"),
  hmPriya: profileId(PERSON.hmPriya, "staff"),
};

type SpaceSpec = readonly [string, string, string, string];

export const COURSE_SPACES: readonly C.CourseSpace[] = [
  ...(
    [
      [CS.lsStory, OFF.lsSeedlings[0], "LS-STORY-NUR", "Seedlings Story Circle"],
      [CS.rvY5Eng, OFF.rvSouthYearFive[0], "RV-Y5-ENG", "Year 5 South — English"],
      [CS.rvY5Math, OFF.rvSouthYearFive[1], "RV-Y5-MATH", "Year 5 South — Mathematics"],
      [CS.rvY7Sci, OFF.rvSouthYearSeven[0], "RV-Y7-SCI", "Year 7 South — Science"],
      [CS.rvY7Hist, OFF.rvSouthYearSeven[1], "RV-Y7-HIST", "Year 7 South — History"],
      [CS.rvY9Eng, OFF.rvNorthYearNine[0], "RV-Y9-ENG", "Year 9 North — English"],
      [CS.rvY9Math, OFF.rvNorthYearNine[1], "RV-Y9-MATH", "Year 9 North — Mathematics"],
      [CS.rvY10Sci, OFF.rvNorthYearTen[0], "RV-Y10-SCI", "Year 10 North — Science"],
      [CS.rvY10Hist, OFF.rvNorthYearTen[1], "RV-Y10-HIST", "Year 10 North — History"],
      [CS.nbCs101, OFF.nbFirstYear[0], "NB-CS101", "CS101 Programming Fundamentals"],
      [CS.axAlgebra, OFF.axFoundation[0], "AX-ALG-FND", "Foundation Algebra"],
      [CS.hmPiano, OFF.hmBeginner[0], "HM-PIANO-BEG", "Beginner Piano Studio"],
    ] as readonly SpaceSpec[]
  ).map(([id, offeringId, code, title]): C.CourseSpace => {
    const offering = SUBJECT_OFFERINGS.find((row) => row.id === offeringId);
    const group = CLASS_GROUPS.find((row) => row.id === offering?.classGroupId);
    const calendar = ACADEMIC_CALENDARS.find((row) => row.id === offering?.academicYearId);
    if (!offering || !group || !calendar) throw new Error(`Incomplete space fixture ${id}`);
    return {
      id,
      tenantId: offering.tenantId,
      institutionId: group.institutionId,
      kind: "class",
      subjectOfferingId: offering.id,
      code,
      title,
      summary: `Class space for ${title}.`,
      academicYearId: offering.academicYearId,
      staffProfileIds: [...offering.staffProfileIds],
      classGroupIds: [group.id],
      status: "published",
      startsOn: calendar.startsOn,
      endsOn: calendar.endsOn,
      selfEnrol: false,
      ...ts,
    };
  }),
  {
    id: CS.hmSightRead,
    tenantId: T.harmony,
    institutionId: I.harmony,
    kind: "course",
    subjectOfferingId: null,
    code: "HM-SIGHT-OPEN",
    title: "Self-Paced Sight-Reading Workshop",
    summary: "Open-enrolment rhythm and notation drills for Harmony learners.",
    academicYearId: null,
    staffProfileIds: [P.hmPriya],
    classGroupIds: [],
    status: "published",
    startsOn: null,
    endsOn: null,
    selfEnrol: true,
    ...ts,
  },
];

function mods(
  courseSpaceId: string,
  ids: readonly string[],
  titles: readonly string[],
  outcomes: readonly string[] = [],
  opts?: { unlock?: readonly string[]; chain?: boolean },
): C.CourseModule[] {
  const space = COURSE_SPACES.find((row) => row.id === courseSpaceId);
  if (!space) throw new Error(`Missing course space ${courseSpaceId}`);
  return ids.map((id, i) => {
    const prev = opts?.chain && i > 0 ? ids[i - 1] : undefined;
    const outcome = outcomes[i];
    return {
      id,
      tenantId: space.tenantId,
      courseSpaceId,
      title: titles[i] ?? `Module ${i + 1}`,
      order: i + 1,
      unlockOn: opts?.unlock?.[i] ?? null,
      prerequisiteModuleIds: prev ? [prev] : [],
      outcomeIds: outcome ? [outcome] : [],
    };
  });
}

export const COURSE_MODULES: readonly C.CourseModule[] = [
  ...mods(CS.lsStory, CM.lsStory, ["Picture Stories", "Retelling"], [O.lsLang1, O.lsLang2]),
  ...mods(CS.rvY5Eng, CM.rvY5Eng, ["Main Ideas", "Summary"], [O.rvEngRead, O.rvEngRead]),
  ...mods(
    CS.rvY5Math,
    CM.rvY5Math,
    ["Equivalent Fractions", "Adding Fractions", "Review"],
    [O.rvMathFrac, O.rvMathFrac, O.rvMathFrac],
    { unlock: ["2026-09-14", "2026-09-21"], chain: true },
  ),
  ...mods(CS.rvY7Sci, CM.rvY7Sci, ["The Water Cycle", "Weather Patterns"]),
  ...mods(CS.rvY7Hist, CM.rvY7Hist, ["Primary Sources", "Timelines and Context"]),
  ...mods(CS.rvY9Eng, CM.rvY9Eng, ["Thesis Building", "Evidence"], [O.rvEngWrite, O.rvEngWrite]),
  ...mods(CS.rvY9Math, CM.rvY9Math, ["Linear Equations", "Graphs"], [O.rvMathAlg, O.rvMathAlg]),
  ...mods(CS.rvY10Sci, CM.rvY10Sci, ["Experimental Design", "Data Interpretation"]),
  ...mods(CS.rvY10Hist, CM.rvY10Hist, ["Document Analysis", "Comparative Essays"]),
  ...mods(CS.nbCs101, CM.nbCs101, ["Loops", "Testing"], [O.nbCo1, O.nbCo2], { chain: true }),
  ...mods(CS.axAlgebra, CM.axAlgebra, ["Quadratics", "Speed Drills"], [O.axAlgQuad, O.axAlgQuad]),
  ...mods(CS.hmPiano, CM.hmPiano, ["Major Scales", "Intervals"], [O.hmGrade1, O.hmGrade2]),
  ...mods(CS.hmSightRead, CM.hmSightRead, ["Rhythm", "Keys"], [O.hmGrade1, O.hmGrade3]),
];

export const DISCUSSION_THREADS: readonly C.DiscussionThread[] = [
  {
    id: DT.rvMathQna,
    tenantId: T.riverside,
    courseSpaceId: CS.rvY5Math,
    title: "Questions on Equivalent Fractions",
    authorProfileId: P.rvAmira,
    pinned: true,
    locked: false,
    postCount: 3,
    lastPostAt: "2026-09-16T10:30:00Z",
    createdAt: "2026-09-15T08:30:00Z",
  },
  {
    id: DT.nbCs101Lab,
    tenantId: T.northbridge,
    courseSpaceId: CS.nbCs101,
    title: "CS101 Loops Lab Tips",
    authorProfileId: P.nbElena,
    pinned: false,
    locked: false,
    postCount: 2,
    lastPostAt: "2026-09-12T16:00:00Z",
    createdAt: "2026-09-10T12:00:00Z",
  },
];

type PostRow = readonly [string, string, string | null, string, string, string, string?];
const rvQ = DT.rvMathQna;
const nbL = DT.nbCs101Lab;

export const DISCUSSION_POSTS: readonly C.DiscussionPost[] = (
  [
    [DP.rvMiaQuestion, rvQ, null, P.rvMia, "Does 3/6 equal 1/2?", "2026-09-16T09:00:00Z"],
    [DP.rvAmiraReply, rvQ, DP.rvMiaQuestion, P.rvAmira, "Divide by 3.", "2026-09-16T10:15:00Z"],
    [DP.rvHiddenPost, rvQ, null, P.rvMia, "Duplicate post.", "2026-09-16T10:30:00Z", P.rvAmira],
    [DP.nbJordanTip, nbL, null, P.nbJordan, "Check empty arrays.", "2026-09-12T15:00:00Z"],
    [DP.nbSofiaReply, nbL, DP.nbJordanTip, P.nbSofia, "Fixed my loop.", "2026-09-12T16:00:00Z"],
  ] as readonly PostRow[]
).map(([id, threadId, parentPostId, authorProfileId, body, createdAt, hiddenBy]) => {
  const thread = DISCUSSION_THREADS.find((row) => row.id === threadId);
  if (!thread) throw new Error(`Missing thread ${threadId}`);
  return {
    id,
    tenantId: thread.tenantId,
    threadId,
    parentPostId,
    authorProfileId,
    body,
    hidden: hiddenBy !== undefined,
    hiddenByProfileId: hiddenBy ?? null,
    createdAt,
    editedAt: null,
  };
});

const ITEM_DEFAULTS = {
  refId: null,
  url: null,
  required: true,
  completion: "view" as const,
  passMarkBps: null,
  dueAt: null,
  published: true,
};

function item(
  id: string,
  moduleId: string,
  kind: C.CourseItem["kind"],
  title: string,
  order: number,
  opts?: Partial<C.CourseItem>,
): C.CourseItem {
  const mod = COURSE_MODULES.find((row) => row.id === moduleId);
  if (!mod) throw new Error(`Missing course module ${moduleId}`);
  return { id, tenantId: mod.tenantId, moduleId, kind, title, order, ...ITEM_DEFAULTS, ...opts };
}

const due = (d: string) => `${d}T16:00:00Z`;
const link = (id: string, m: string, title: string, o: number, slug: string) =>
  item(id, m, "link", title, o, { url: `https://practice.example.edu/${slug}` });
const disc = (id: string, m: string, title: string, o: number, refId: string) =>
  item(id, m, "discussion", title, o, { refId, required: false, completion: "none" });
const cnt = (id: string, m: string, t: string, o: number, refId: string, bps?: number) =>
  item(id, m, "content", t, o, bps ? { refId, completion: "pass", passMarkBps: bps } : { refId });
const asg = (id: string, m: string, t: string, o: number, r: string, d: string) =>
  item(id, m, "assignment", t, o, { refId: r, completion: "submit", dueAt: due(d) });
const tst = (id: string, m: string, t: string, o: number, r: string, bps: number, d: string) =>
  item(id, m, "test", t, o, { refId: r, completion: "pass", passMarkBps: bps, dueAt: due(d) });
const lvs = (id: string, m: string, t: string, o: number, refId: string) =>
  item(id, m, "live_session", t, o, { refId });

export const COURSE_ITEMS: readonly C.CourseItem[] = [
  item(IT.lsStoryIntro, CM.lsStory[0], "page", "Welcome to Story Circle", 1),
  cnt(IT.lsStoryGuide, CM.lsStory[0], "Picture Prompts", 2, CI.lsStoryGuide),
  item(IT.rvY5EngPage, CM.rvY5Eng[0], "page", "Reading Non-Fiction Guide", 1),
  lvs(LI.rvY5EngLive, CM.rvY5Eng[0], "Main Ideas Live", 2, LS.rvY5EngEnded),
  cnt(IT.rvY5MathLesson, CM.rvY5Math[0], "Equivalent Fractions", 1, CI.rvFractionsLesson),
  link(IT.rvY5MathLink, CM.rvY5Math[1], "Fraction Bar", 1, "fractions"),
  disc(IT.rvY5MathDiscuss, CM.rvY5Math[1], "Fractions Q&A", 2, DT.rvMathQna),
  asg(AI.rvY5MathAssign, CM.rvY5Math[1], "Fractions Set", 3, AG.rvFracPractice, "2026-09-25"),
  item(IT.rvY5MathFile, CM.rvY5Math[2], "file", "Review Worksheet PDF", 1),
  tst(AI.rvY5MathQuiz, CM.rvY5Math[2], "Fractions Quiz", 2, OT.rvFracQuiz, 6000, "2026-09-28"),
  cnt(IT.rvY7SciVideo, CM.rvY7Sci[0], "Water Cycle Video", 1, CI.rvWaterVideo),
  item(IT.rvY7HistPage, CM.rvY7Hist[0], "page", "Reading Primary Sources", 1),
  item(IT.rvY9EngFile, CM.rvY9Eng[0], "file", "Thesis Checklist Handout", 1),
  link(IT.rvY9MathLink, CM.rvY9Math[0], "Graphing Explorer", 1, "graphs"),
  item(IT.rvY10SciPage, CM.rvY10Sci[0], "page", "Lab Method Overview", 1),
  item(IT.rvY10HistFile, CM.rvY10Hist[0], "file", "Source Evaluation Rubric", 1),
  item(IT.nbCs101Intro, CM.nbCs101[0], "page", "CS101 Syllabus & Setup", 1),
  cnt(IT.nbCs101Lab, CM.nbCs101[0], "SCORM Lab", 2, CI.nbScormLab, 7000),
  disc(IT.nbCs101Discuss, CM.nbCs101[1], "Loops Lab Forum", 1, DT.nbCs101Lab),
  asg(AI.nbCs101Assign, CM.nbCs101[1], "Control-Flow Lab", 2, AG.nbAlgoLab, "2026-09-24"),
  lvs(LI.nbCs101Live, CM.nbCs101[1], "Loops Live Q&A", 3, LS.nbCs101OfficeHour),
  item(IT.axAlgIntro, CM.axAlgebra[0], "page", "Quadratic Formula Sheet", 1),
  cnt(IT.axAlgDrill, CM.axAlgebra[1], "cmi5 Drill", 1, CI.axCmi5Drill, 7500),
  tst(AI.axAlgMock, CM.axAlgebra[1], "STEM Timed Mock 1", 2, OT.axMock, 7000, "2026-09-30"),
  item(IT.hmPianoIntro, CM.hmPiano[0], "page", "Warm-Up Practice Routine", 1),
  lvs(LI.hmPianoLive, CM.hmPiano[0], "Scales Group Recital", 2, LS.hmPianoScheduled),
  cnt(IT.hmPianoAudio, CM.hmPiano[1], "Interval Track", 1, CI.hmEarAudio),
  item(IT.hmSightIntro, CM.hmSightRead[0], "page", "Daily Sight-Reading Plan", 1),
  link(IT.hmSightLink, CM.hmSightRead[1], "Metronome", 1, "metronome"),
];

type ProgRow = readonly [string, string, readonly string[], string | null];

export const COURSE_PROGRESS: readonly C.CourseProgress[] = (
  [
    [CS.lsStory, L.lsKavya, [IT.lsStoryIntro, IT.lsStoryGuide], "2026-07-10T05:30:00Z"],
    [CS.rvY5Math, L.rvMia, [IT.rvY5MathLesson, IT.rvY5MathLink], "2026-09-16T10:15:00Z"],
    [CS.rvY10Sci, L.rvOliver, [IT.rvY10SciPage], "2026-09-18T11:00:00Z"],
    [CS.nbCs101, L.nbJordan, [IT.nbCs101Intro, IT.nbCs101Lab], "2026-09-12T15:05:00Z"],
    [CS.axAlgebra, L.axVijay, [IT.axAlgIntro], "2026-09-18T09:20:00Z"],
    [CS.axAlgebra, L.axDivya, [], null],
    [CS.hmPiano, L.hmEthan, [IT.hmPianoIntro, IT.hmPianoAudio], "2026-06-12T08:10:00Z"],
  ] as readonly ProgRow[]
).map(([sid, learnerId, completedItemIds, lastActivityAt]) => {
  const space = COURSE_SPACES.find((row) => row.id === sid);
  if (!space) throw new Error(`Missing course space ${sid}`);
  const modIds = new Set(COURSE_MODULES.filter((r) => r.courseSpaceId === sid).map((r) => r.id));
  const reqCount = COURSE_ITEMS.filter((r) => modIds.has(r.moduleId) && r.required).length;
  const pct = reqCount === 0 ? 0 : Math.round((completedItemIds.length * 10000) / reqCount);
  return {
    tenantId: space.tenantId,
    courseSpaceId: sid,
    learnerId,
    completedItemIds: [...completedItemIds],
    percentBps: Math.min(10000, pct),
    lastActivityAt,
  };
});
