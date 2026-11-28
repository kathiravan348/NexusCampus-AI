/** Stable IDs for the Stage 4 M34 and M36 demo fixtures (D16). */

export const LIVE_COURSE_ITEM = {
  rvY5EngLive: "cit-rv-y5-eng-live",
  nbCs101Live: "cit-nb-cs101-live",
  hmPianoLive: "cit-hm-piano-live",
} as const;

export const PROCTORING_SESSION = {
  nbJordan: "prs-nb-jordan",
  nbSofia: "prs-nb-sofia",
  axVijay: "prs-ax-vijay",
  axDivya: "prs-ax-divya",
} as const;

export const RECORDING_SEGMENT = {
  nbJordanScreen: "rgs-nb-jordan-scr",
  nbJordanCamera: "rgs-nb-jordan-cam",
  nbSofiaScreen: "rgs-nb-sofia-scr",
  nbSofiaCamera: "rgs-nb-sofia-cam",
  axVijayScreen: "rgs-ax-vijay-scr",
} as const;

export const PROCTORING_FLAG = {
  nbJordanTab: "pfl-nb-jordan-tab",
  nbJordanCopy: "pfl-nb-jordan-copy",
  nbJordanNoPerson: "pfl-nb-jordan-noperson",
  nbSofiaOther: "pfl-nb-sofia-other",
  nbSofiaAnother: "pfl-nb-sofia-another",
  nbSofiaVoices: "pfl-nb-sofia-voices",
  axVijayBlur: "pfl-ax-vijay-blur",
  axVijayDisconnect: "pfl-ax-vijay-disc",
} as const;

export const LIVE_SESSION = {
  rvY5EngEnded: "lvs-rv-y5-eng-1",
  rvY5MathEnded: "lvs-rv-y5-math-1",
  rvY9EngLive: "lvs-rv-y9-eng-1",
  rvY5MathCancelled: "lvs-rv-y5-math-2",
  nbCs101OfficeHour: "lvs-nb-cs101-1",
  nbCs101Review: "lvs-nb-cs101-2",
  hmPianoScheduled: "lvs-hm-piano-1",
} as const;

export const LIVE_JOIN = {
  rvMathAmira: "lvj-rv-math-amira",
  rvMathMia: "lvj-rv-math-mia",
  rvEngTom: "lvj-rv-eng-tom",
  rvEngElla: "lvj-rv-eng-ella",
  nbCsElena: "lvj-nb-cs101-elena",
  nbCsJordan: "lvj-nb-cs101-jordan",
  nbCsSofia: "lvj-nb-cs101-sofia",
  nbRevElena: "lvj-nb-rev-elena",
  nbRevJordan: "lvj-nb-rev-jordan",
} as const;

export const LIVE_RECORDING = {
  rvY5EngDeleted: "lvr-rv-y5-eng-del",
  rvY5MathReady: "lvr-rv-y5-math-rdy",
  nbCs101Ready: "lvr-nb-cs101-rdy",
  nbCs101Processing: "lvr-nb-cs101-proc",
  nbCs101Failed: "lvr-nb-cs101-fail",
} as const;

export const LIVE_SUMMARY = {
  rvY5MathPublished: "lsm-rv-y5-math-pub",
  nbCs101Draft: "lsm-nb-cs101-draft",
} as const;
