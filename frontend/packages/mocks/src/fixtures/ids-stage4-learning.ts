/** Stable IDs for the Stage 4 M29–M31 demo fixtures (D16). */

export const OUTCOME_FRAMEWORK = {
  lsMilestones: "ofw-ls-milestones",
  rvStandards: "ofw-rv-standards",
  nbCourseOutcomes: "ofw-nb-cs-co",
  nbProgramOutcomes: "ofw-nb-bscs-po",
  axSyllabus: "ofw-ax-exam-syllabus",
  hmSkills: "ofw-hm-graded-skills",
} as const;

export const OUTCOME = {
  lsLang1: "out-ls-lang-1",
  lsLang2: "out-ls-lang-2",
  lsMotor1: "out-ls-motor-1",
  lsMotor2: "out-ls-motor-2",
  lsSocial1: "out-ls-social-1",
  lsNature1: "out-ls-nature-1",

  rvMathDomain: "out-rv-math",
  rvMathFrac: "out-rv-math-5-1",
  rvMathAlg: "out-rv-math-9-1",
  rvEngDomain: "out-rv-eng",
  rvEngRead: "out-rv-eng-5-1",
  rvEngWrite: "out-rv-eng-9-1",

  nbCo1: "out-nb-co-1",
  nbCo2: "out-nb-co-2",
  nbCo3: "out-nb-co-3",
  nbPo1: "out-nb-po-1",
  nbPo2: "out-nb-po-2",
  nbPo3: "out-nb-po-3",

  axAlgQuad: "out-ax-alg-1",
  axMechKin: "out-ax-mech-1",
  axCalcDer: "out-ax-calc-1",

  hmGrade1: "out-hm-grade-1",
  hmGrade2: "out-hm-grade-2",
  hmGrade3: "out-hm-grade-3",
} as const;

export const OUTCOME_MAPPING = {
  nbCo1Po1: "omp-nb-co1-po1",
  nbCo1Po2: "omp-nb-co1-po2",
  nbCo2Po2: "omp-nb-co2-po2",
  nbCo3Po3: "omp-nb-co3-po3",
  nbCo3Po1: "omp-nb-co3-po1",
} as const;

export const SYLLABUS_UNIT = {
  rvMathY5: "syu-rv-math-y5",
  rvMathY9: "syu-rv-math-y9",
  rvEngY5: "syu-rv-eng-y5",
  rvEngY9: "syu-rv-eng-y9",
} as const;

export const SYLLABUS_TOPIC = {
  rvMath1: "syt-rv-math-1",
  rvMath2: "syt-rv-math-2",
  rvMath3: "syt-rv-math-3",
  rvMath4: "syt-rv-math-4",
  rvEng1: "syt-rv-eng-1",
  rvEng2: "syt-rv-eng-2",
  rvEng3: "syt-rv-eng-3",
  rvEng4: "syt-rv-eng-4",
} as const;

export const LESSON_PLAN = {
  rvDelivered: "lpl-rv-math-delivered",
  rvApproved: "lpl-rv-math-approved",
  rvSubmitted: "lpl-rv-eng-submitted",
  rvReturned: "lpl-rv-eng-returned",
  rvAiDraft: "lpl-rv-math-ai-draft",
} as const;

export const COVERAGE_ENTRY = {
  rvMath1: "cov-rv-y5-math-1",
  rvMath2: "cov-rv-y5-math-2",
  rvEng3: "cov-rv-y9-eng-3",
  rvEng4: "cov-rv-y9-eng-4",
} as const;

export const CONTENT_ASSET = {
  lsStoryPdf: "cas-ls-story-pdf",
  rvFractionChart: "cas-rv-fraction-chart",
  rvFractionClip: "cas-rv-fraction-clip",
  rvFractionCaptions: "cas-rv-fraction-captions",
  rvEssayDiagram: "cas-rv-essay-diagram",
  rvWaterVideo: "cas-rv-water-video",
  rvWaterCaptions: "cas-rv-water-captions",
  nbScormPkg: "cas-nb-scorm-pkg",
  axCmi5Pkg: "cas-ax-cmi5-pkg",
  hmIntervalAudio: "cas-hm-interval-audio",
  hmIntervalTranscript: "cas-hm-interval-transcript",
} as const;

export const CONTENT_ITEM = {
  lsStoryGuide: "cnt-ls-story-guide",
  rvFractionsLesson: "cnt-rv-fractions-lesson",
  rvDraftLesson: "cnt-rv-draft-lesson",
  rvWaterVideo: "cnt-rv-water-video",
  nbScormLab: "cnt-nb-scorm-lab",
  axCmi5Drill: "cnt-ax-cmi5-drill",
  hmEarAudio: "cnt-hm-ear-audio",
} as const;

export const CONTENT_ATTEMPT = {
  rvMiaLesson: "cat-rv-mia-lesson",
  nbJordanScorm: "cat-nb-jordan-scorm",
  nbSofiaScorm: "cat-nb-sofia-scorm",
  axVijayCmi5: "cat-ax-vijay-cmi5",
  hmEthanAudio: "cat-hm-ethan-audio",
} as const;

export const COURSE_SPACE = {
  lsStory: "csp-ls-story",
  rvY5Eng: "csp-rv-y5-eng",
  rvY5Math: "csp-rv-y5-math",
  rvY7Sci: "csp-rv-y7-sci",
  rvY7Hist: "csp-rv-y7-hist",
  rvY9Eng: "csp-rv-y9-eng",
  rvY9Math: "csp-rv-y9-math",
  rvY10Sci: "csp-rv-y10-sci",
  rvY10Hist: "csp-rv-y10-hist",
  nbCs101: "csp-nb-cs101",
  axAlgebra: "csp-ax-algebra",
  hmPiano: "csp-hm-piano",
  hmSightRead: "csp-hm-sight-read",
} as const;

export const COURSE_MODULE = {
  lsStory: ["cmo-ls-story-1", "cmo-ls-story-2"],
  rvY5Eng: ["cmo-rv-y5-eng-1", "cmo-rv-y5-eng-2"],
  rvY5Math: ["cmo-rv-y5-math-1", "cmo-rv-y5-math-2", "cmo-rv-y5-math-3"],
  rvY7Sci: ["cmo-rv-y7-sci-1", "cmo-rv-y7-sci-2"],
  rvY7Hist: ["cmo-rv-y7-hist-1", "cmo-rv-y7-hist-2"],
  rvY9Eng: ["cmo-rv-y9-eng-1", "cmo-rv-y9-eng-2"],
  rvY9Math: ["cmo-rv-y9-math-1", "cmo-rv-y9-math-2"],
  rvY10Sci: ["cmo-rv-y10-sci-1", "cmo-rv-y10-sci-2"],
  rvY10Hist: ["cmo-rv-y10-hist-1", "cmo-rv-y10-hist-2"],
  nbCs101: ["cmo-nb-cs101-1", "cmo-nb-cs101-2"],
  axAlgebra: ["cmo-ax-algebra-1", "cmo-ax-algebra-2"],
  hmPiano: ["cmo-hm-piano-1", "cmo-hm-piano-2"],
  hmSightRead: ["cmo-hm-sight-1", "cmo-hm-sight-2"],
} as const;

export const COURSE_ITEM = {
  lsStoryIntro: "cit-ls-story-intro",
  lsStoryGuide: "cit-ls-story-guide",
  rvY5EngPage: "cit-rv-y5-eng-page",
  rvY5MathLesson: "cit-rv-y5-math-lesson",
  rvY5MathLink: "cit-rv-y5-math-link",
  rvY5MathDiscuss: "cit-rv-y5-math-discuss",
  rvY5MathFile: "cit-rv-y5-math-file",
  rvY7SciVideo: "cit-rv-y7-sci-video",
  rvY7HistPage: "cit-rv-y7-hist-page",
  rvY9EngFile: "cit-rv-y9-eng-file",
  rvY9MathLink: "cit-rv-y9-math-link",
  rvY10SciPage: "cit-rv-y10-sci-page",
  rvY10HistFile: "cit-rv-y10-hist-file",
  nbCs101Intro: "cit-nb-cs101-intro",
  nbCs101Lab: "cit-nb-cs101-lab",
  nbCs101Discuss: "cit-nb-cs101-discuss",
  axAlgIntro: "cit-ax-alg-intro",
  axAlgDrill: "cit-ax-alg-drill",
  hmPianoIntro: "cit-hm-piano-intro",
  hmPianoAudio: "cit-hm-piano-audio",
  hmSightIntro: "cit-hm-sight-intro",
  hmSightLink: "cit-hm-sight-link",
} as const;

export const DISCUSSION_THREAD = {
  rvMathQna: "dth-rv-math-qna",
  nbCs101Lab: "dth-nb-cs101-lab",
} as const;

export const DISCUSSION_POST = {
  rvMiaQuestion: "dpo-rv-math-1",
  rvAmiraReply: "dpo-rv-math-2",
  rvHiddenPost: "dpo-rv-math-3",
  nbJordanTip: "dpo-nb-cs101-1",
  nbSofiaReply: "dpo-nb-cs101-2",
} as const;
