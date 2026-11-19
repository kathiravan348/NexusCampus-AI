/**
 * Every fixture id as a named constant (D16). Other fixture files use these, never string literals,
 * so a renamed id breaks the build instead of silently breaking a reference.
 */

export const TENANT = {
  littleSteps: "ten-ls",
  riverside: "ten-rv",
  northbridge: "ten-nb",
  apex: "ten-ax",
  harmony: "ten-hm",
} as const;

export const GROUP = {
  riverside: "grp-rv",
} as const;

export const INSTITUTION = {
  littleSteps: "ins-ls",
  riversideSchool: "ins-rv",
  northbridge: "ins-nb",
  apex: "ins-ax",
  harmony: "ins-hm",
} as const;

export const CAMPUS = {
  littleSteps: "cmp-ls-main",
  riversideNorth: "cmp-rv-north",
  riversideSouth: "cmp-rv-south",
  northbridge: "cmp-nb-main",
  apex: "cmp-ax-main",
  harmony: "cmp-hm-main",
} as const;

export const CALENDAR = {
  littleSteps: "cal-ls-2026",
  riversideSchool: "cal-rv-2026",
  northbridge: "cal-nb-2026",
  apex: "cal-ax-2026",
  harmony: "cal-hm-2026",
} as const;

/** People, one key per person: `<tenant><Name>`. */
export const PERSON = {
  lsPriya: "per-ls-priya",
  lsArjun: "per-ls-arjun",
  lsSunita: "per-ls-sunita",
  lsDeepak: "per-ls-deepak",
  lsKavya: "per-ls-kavya",
  lsRohan: "per-ls-rohan",
  lsIshaan: "per-ls-ishaan",
  lsAnaya: "per-ls-anaya",

  rvHelen: "per-rv-helen",
  rvTom: "per-rv-tom",
  rvAmira: "per-rv-amira",
  rvGrace: "per-rv-grace",
  rvDaniel: "per-rv-daniel",
  rvOliver: "per-rv-oliver",
  rvMia: "per-rv-mia",
  rvLeo: "per-rv-leo",
  rvElla: "per-rv-ella",

  nbRobert: "per-nb-robert",
  nbElena: "per-nb-elena",
  nbMarcus: "per-nb-marcus",
  nbPatricia: "per-nb-patricia",
  nbJordan: "per-nb-jordan",
  nbSofia: "per-nb-sofia",
  nbAiden: "per-nb-aiden",
  nbNora: "per-nb-nora",

  axKhalid: "per-ax-khalid",
  axFatima: "per-ax-fatima",
  axOmar: "per-ax-omar",
  axLayla: "per-ax-layla",
  axYousef: "per-ax-yousef",
  axSara: "per-ax-sara",
  axAhmed: "per-ax-ahmed",
  axMariam: "per-ax-mariam",

  hmWeiLing: "per-hm-weiling",
  hmDaniel: "per-hm-daniel",
  hmPriya: "per-hm-priya",
  hmMei: "per-hm-mei",
  hmEthan: "per-hm-ethan",
  hmChloe: "per-hm-chloe",
  hmRachel: "per-hm-rachel",
  hmMarcus: "per-hm-marcus",
} as const;

/** Sign-in accounts: same keys as `PERSON` for the people who sign in. */
export const USER = {
  lsPriya: "usr-ls-priya",
  lsArjun: "usr-ls-arjun",
  lsSunita: "usr-ls-sunita",
  lsDeepak: "usr-ls-deepak",

  rvHelen: "usr-rv-helen",
  rvTom: "usr-rv-tom",
  rvAmira: "usr-rv-amira",
  rvGrace: "usr-rv-grace",
  rvDaniel: "usr-rv-daniel",
  rvOliver: "usr-rv-oliver",

  nbRobert: "usr-nb-robert",
  nbElena: "usr-nb-elena",
  nbMarcus: "usr-nb-marcus",
  nbPatricia: "usr-nb-patricia",
  nbJordan: "usr-nb-jordan",
  nbSofia: "usr-nb-sofia",

  axKhalid: "usr-ax-khalid",
  axFatima: "usr-ax-fatima",
  axOmar: "usr-ax-omar",
  axLayla: "usr-ax-layla",
  axAhmed: "usr-ax-ahmed",

  hmWeiLing: "usr-hm-weiling",
  hmDaniel: "usr-hm-daniel",
  hmPriya: "usr-hm-priya",
  hmMei: "usr-hm-mei",
  hmRachel: "usr-hm-rachel",
} as const;

export const SSO_PROVIDER = {
  riversideSaml: "sso-rv-saml",
  northbridgeOidc: "sso-nb-oidc",
} as const;

/** System role keys; the role id per tenant is `roleId(tenantId, key)`. */
export const SYSTEM_ROLE_KEYS = ["owner", "admin", "teacher", "guardian", "learner"] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export const roleId = (tenantId: string, key: SystemRoleKey): string =>
  `role-${tenantId.replace(/^ten-/, "")}-${key}`;

export const PLAN = {
  starter: "pln-starter",
  standard: "pln-standard",
  enterprise: "pln-enterprise",
} as const;

export const FONT = {
  inter: "inter",
  notoSansArabic: "noto-sans-arabic",
  jetbrainsMono: "jetbrains-mono",
} as const;

export const THEME = {
  littleSteps: "thm-ls",
  riversideGroup: "thm-rv-group",
  riversideSchool: "thm-rv-school",
  northbridge: "thm-nb",
  apex: "thm-ax",
  harmony: "thm-hm",
} as const;

export const TEXT_OVERRIDE = {
  riversideLearner: "txo-rv-learner",
  riversideLearners: "txo-rv-learners",
  riversideNorthClass: "txo-rv-north-class",
  apexLearnerAr: "txo-ax-learner-ar",
} as const;
