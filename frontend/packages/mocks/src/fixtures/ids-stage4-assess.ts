/** Stable IDs for the Stage 4 M32, M33, M35 and M46 demo fixtures (D16). */

export const ASSESS_COURSE_ITEM = {
  rvY5MathAssign: "cit-rv-y5-math-assign",
  rvY5MathQuiz: "cit-rv-y5-math-quiz",
  nbCs101Assign: "cit-nb-cs101-assign",
  axAlgMock: "cit-ax-alg-mock",
} as const;

export const ASSIGNMENT = {
  lsStoryPhoto: "asg-ls-story-photo",
  rvFracPractice: "asg-rv-frac-practice",
  rvEssayPeer: "asg-rv-essay-peer",
  nbAlgoLab: "asg-nb-algo-lab",
  axQuadSheet: "asg-ax-quad-sheet",
  hmScaleRec: "asg-hm-scale-rec",
} as const;

export const ASSIGNMENT_SUBMISSION = {
  lsKavyaPhoto: "asb-ls-kavya-photo",
  rvMiaFrac: "asb-rv-mia-frac",
  rvEllaEssay: "asb-rv-ella-essay",
  rvOliverEssay: "asb-rv-oliver-essay",
  nbJordanLab: "asb-nb-jordan-lab",
  nbAidenLab: "asb-nb-aiden-lab",
  hmEthanScale: "asb-hm-ethan-scale",
  hmChloeDraft: "asb-hm-chloe-draft",
} as const;

export const FEEDBACK = {
  rvMiaFrac: "sfb-rv-mia-frac",
  rvEllaEssay: "sfb-rv-ella-essay",
  nbJordanLab: "sfb-nb-jordan-lab",
  nbAidenLab: "sfb-nb-aiden-lab",
  hmEthanScale: "sfb-hm-ethan-scale",
} as const;

export const AI_MARKING_SUGGESTION = {
  rvMiaAccepted: "ams-rv-mia-accepted",
  rvEllaEdited: "ams-rv-ella-edited",
  nbJordanRejected: "ams-nb-jordan-rejected",
  rvOliverPending: "ams-rv-oliver-pending",
} as const;

export const PEER_REVIEW = {
  rvOliverOnElla: "prw-rv-oliver-ella",
  rvEllaOnOliver: "prw-rv-ella-oliver",
} as const;

export const ORIGINALITY_SIGNAL = {
  nbJordanReady: "ors-nb-jordan-ready",
  nbAidenPending: "ors-nb-aiden-pending",
} as const;

export const QUESTION_BANK = {
  rvMath: "qbk-rv-math",
  nbCs: "qbk-nb-cs",
  axStem: "qbk-ax-stem",
  hmMusic: "qbk-hm-music",
} as const;

export const QUESTION_ITEM = {
  rvFracChoice: "qit-rv-frac-choice",
  rvFracTf: "qit-rv-frac-tf",
  rvFracOrder: "qit-rv-frac-order",
  rvAlgAiReview: "qit-rv-alg-ai-review",
  nbLoopMulti: "qit-nb-loop-multi",
  nbTestEssay: "qit-nb-test-essay",
  axQuadMcq: "qit-ax-quad-mcq",
  axQuadNumeric: "qit-ax-quad-numeric",
  axMechMcq: "qit-ax-mech-mcq",
  hmKeyShort: "qit-hm-key-short",
} as const;

export const ONLINE_TEST = {
  rvFracQuiz: "tst-rv-frac-quiz",
  nbCsMidterm: "tst-nb-cs-midterm",
  axMock: "tst-ax-mock",
  axAdaptive: "tst-ax-adaptive",
  hmTheoryCheck: "tst-hm-theory-check",
} as const;

export const TEST_SECTION = {
  rvFracFixed: "tsc-rv-frac-fixed",
  nbCsFixed: "tsc-nb-cs-fixed",
  axMockAlg: "tsc-ax-mock-alg",
  axMockPool: "tsc-ax-mock-pool",
  axAdaptPool: "tsc-ax-adapt-pool",
  hmTheoryFixed: "tsc-hm-theory-fixed",
} as const;

export const TEST_ATTEMPT = {
  rvMiaPractice: "tat-rv-mia-practice",
  nbJordanMid: "tat-nb-jordan-mid",
  nbSofiaMid: "tat-nb-sofia-mid",
  axVijayMock: "tat-ax-vijay-mock",
  axDivyaMock: "tat-ax-divya-mock",
  hmRachelTheory: "tat-hm-rachel-theory",
} as const;

export const TEST_RESPONSE = {
  rvMiaChoice: "trp-rv-mia-choice",
  rvMiaTf: "trp-rv-mia-tf",
  rvMiaOrder: "trp-rv-mia-order",
  nbJordanMulti: "trp-nb-jordan-multi",
  nbJordanEssay: "trp-nb-jordan-essay",
  nbSofiaMulti: "trp-nb-sofia-multi",
  nbSofiaEssay: "trp-nb-sofia-essay",
  axVijayQuad: "trp-ax-vijay-quad",
  axVijayNum: "trp-ax-vijay-num",
  axDivyaQuad: "trp-ax-divya-quad",
  axDivyaMech: "trp-ax-divya-mech",
  hmRachelShort: "trp-hm-rachel-short",
} as const;

export const LEARNING_PATH = {
  rvMiaMath: "lpa-rv-mia-math",
  axVijayAlg: "lpa-ax-vijay-alg",
  nbJordanCs: "lpa-nb-jordan-cs",
  hmEthanPiano: "lpa-hm-ethan-piano",
} as const;

export const LEARNING_PATH_STEP = {
  rvMia1: "lps-rv-mia-1",
  rvMia2: "lps-rv-mia-2",
  rvMia3: "lps-rv-mia-3",
  axVijay1: "lps-ax-vijay-1",
  axVijay2: "lps-ax-vijay-2",
  axVijay3: "lps-ax-vijay-3",
  nbJordan1: "lps-nb-jordan-1",
  nbJordan2: "lps-nb-jordan-2",
  hmEthan1: "lps-hm-ethan-1",
} as const;

export const TUTOR_SESSION = {
  rvMiaFractions: "tse-rv-mia-fractions",
  nbJordanLoops: "tse-nb-jordan-loops",
  axArunQuad: "tse-ax-arun-quad",
} as const;

export const TUTOR_MESSAGE = {
  rvMia1: "tmg-rv-mia-1",
  rvMia2: "tmg-rv-mia-2",
  nbJordan1: "tmg-nb-jordan-1",
  nbJordan2: "tmg-nb-jordan-2",
  nbJordan3: "tmg-nb-jordan-3",
  nbJordan4: "tmg-nb-jordan-4",
  axArun1: "tmg-ax-arun-1",
  axArun2: "tmg-ax-arun-2",
} as const;

export const RISK_SCORE = {
  axDivyaHigh: "rsk-ax-divya-high",
  nbAidenMed: "rsk-nb-aiden-med",
  rvOliverLow: "rsk-rv-oliver-low",
  rvEllaExpired: "rsk-rv-ella-expired",
} as const;

export const INTERVENTION = {
  axDivyaTutoring: "itv-ax-divya-tutoring",
  nbAidenMeeting: "itv-nb-aiden-meeting",
  rvEllaCompleted: "itv-rv-ella-completed",
  hmChloeCancelled: "itv-hm-chloe-cancelled",
} as const;
