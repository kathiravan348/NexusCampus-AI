// Stable IDs for Stage 4 care fixtures (NEX-260).
export const DIARY_ENTRY = {
  meal: "diary-ls-meal",
  drink: "diary-ls-drink",
  nap: "diary-ls-nap",
  nappy: "diary-ls-nappy",
  toilet: "diary-ls-toilet",
  activity: "diary-ls-activity",
  note: "diary-ls-note",
} as const;

export const OBSERVATION = {
  turnTaking: "obs-ls-turn-taking",
} as const;

export const PICKUP_CHECK = {
  guardian: "pck-ls-guardian",
  authorisedPerson: "pck-ls-authorised-person",
  staff: "pck-ls-staff",
  transport: "pck-ls-transport",
  refused: "pck-ls-refused",
} as const;

export const DAY_SUMMARY = {
  draft: "dsm-ls-draft",
  sent: "dsm-ls-sent",
} as const;

export const SUPPORT_PLAN = {
  rvReading: "spl-rv-reading",
  rvReview: "spl-rv-review",
  nbAccess: "spl-nb-access",
  nbClosed: "spl-nb-closed",
} as const;

export const SUPPORT_GOAL = {
  draft: "sgl-draft",
  active: "sgl-active",
  achieved: "sgl-achieved",
  discontinued: "sgl-discontinued",
} as const;

export const ACCOMMODATION = {
  extraTime: "acm-extra-time",
} as const;

export const SUPPORT_SESSION = {
  readingPractice: "ses-reading-practice",
  planningPractice: "ses-planning-practice",
} as const;

export const GOAL_PROGRESS = {
  notStarted: "gpr-not-started",
  emerging: "gpr-emerging",
  progressing: "gpr-progressing",
  achieved: "gpr-achieved",
} as const;

export const MEDIA_SHARING_CONSENT = {
  lsIshaan: "cns-media-ls-ishaan",
  rvMia: "cns-media-rv-mia",
  rvElla: "cns-media-rv-ella",
} as const;

export const MEDIA_ITEM = {
  lsActivity: "mdi-ls-activity",
  lsGroup: "mdi-ls-group",
  rvWork: "mdi-rv-work",
  rvPending: "mdi-rv-pending",
} as const;

export const PORTFOLIO = {
  lsIshaan: "pfl-ls-ishaan",
  rvMia: "pfl-rv-mia",
} as const;

export const PORTFOLIO_ENTRY = {
  media: "pfe-media",
  observation: "pfe-observation",
  reflection: "pfe-reflection",
} as const;

export const PORTFOLIO_EXPORT = {
  queued: "pfx-queued",
  ready: "pfx-ready",
  failed: "pfx-failed",
  expired: "pfx-expired",
} as const;

export const CARE_CLIENT_ID = {
  meal: "4e260000-0000-4000-8000-000000000001",
  drink: "4e260000-0000-4000-8000-000000000002",
  nap: "4e260000-0000-4000-8000-000000000003",
  nappy: "4e260000-0000-4000-8000-000000000004",
  toilet: "4e260000-0000-4000-8000-000000000005",
  activity: "4e260000-0000-4000-8000-000000000006",
  note: "4e260000-0000-4000-8000-000000000007",
  turnTaking: "4e260000-0000-4000-8000-000000000008",
  guardian: "4e260000-0000-4000-8000-000000000009",
  authorisedPerson: "4e260000-0000-4000-8000-000000000010",
  staff: "4e260000-0000-4000-8000-000000000011",
  transport: "4e260000-0000-4000-8000-000000000012",
  refused: "4e260000-0000-4000-8000-000000000013",
} as const;
