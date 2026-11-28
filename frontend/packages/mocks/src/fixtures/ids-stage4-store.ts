/** Stable IDs for the Stage 4 M42 and M43 demo fixtures (D16). */

export const PROGRAM_REQUIREMENT = {
  nbCore: "prq-nb-core",
  nbElectives: "prq-nb-electives",
  nbProject: "prq-nb-project",
} as const;

export const REGISTRATION_WINDOW = {
  nbFallClosed: "rgw-nb-fall-closed",
  nbSpringOpen: "rgw-nb-spring-open",
  nbSpringDraft: "rgw-nb-spring-draft",
} as const;

export const ELECTIVE_REGISTRATION = {
  nbConfirmed: "elr-nb-confirmed",
  nbRejected: "elr-nb-rejected",
  nbSubmitted: "elr-nb-submitted",
  nbWaitlisted: "elr-nb-waitlisted",
  nbWithdrawn: "elr-nb-withdrawn",
} as const;

export const ELECTIVE_CLIENT = {
  nbConfirmed: "b263a100-c000-4b00-8d00-e000a0000001",
  nbRejected: "b263a100-c000-4b00-8d00-e000a0000002",
  nbSubmitted: "b263a100-c000-4b00-8d00-e000a0000003",
  nbWaitlisted: "b263a100-c000-4b00-8d00-e000a0000004",
  nbWithdrawn: "b263a100-c000-4b00-8d00-e000a0000005",
} as const;

export const DEGREE_AUDIT = {
  nbAidenProgress: "dau-nb-aiden-progress",
  nbNoraEligible: "dau-nb-nora-eligible",
} as const;

export const THESIS = {
  nbProposal: "ths-nb-proposal",
  nbInProgress: "ths-nb-in-progress",
  nbSubmitted: "ths-nb-submitted",
  nbUnderExam: "ths-nb-under-exam",
  nbRevisions: "ths-nb-revisions",
  nbAccepted: "ths-nb-accepted",
  nbWithdrawn: "ths-nb-withdrawn",
} as const;

export const PATH_ADVICE = {
  nbDraft: "pad-nb-draft",
  nbReviewed: "pad-nb-reviewed",
} as const;

export const STORE_PRODUCT = {
  axCourse: "prd-ax-course",
  axSubscription: "prd-ax-subscription",
  axAiDraft: "prd-ax-ai-draft",
  hmCourse: "prd-hm-course",
  hmPack: "prd-hm-pack",
  hmBundle: "prd-hm-bundle",
  hmArchived: "prd-hm-archived",
} as const;

export const COUPON = {
  axPercent: "cpn-ax-percent",
  hmAmount: "cpn-hm-amount",
} as const;

export const STORE_ORDER = {
  axFulfilled: "ord-ax-fulfilled",
  axPaid: "ord-ax-paid",
  axPending: "ord-ax-pending",
  hmRefunded: "ord-hm-refunded",
  hmCancelled: "ord-hm-cancelled",
  hmFailed: "ord-hm-failed",
} as const;

export const STORE_GATEWAY_REF = {
  axFulfilled: "payref-ax-ord-01",
  axPaid: "payref-ax-ord-02",
  hmRefunded: "payref-hm-ord-01",
  hmFailed: "payref-hm-ord-03",
} as const;

export const STORE_SUBSCRIPTION = {
  axTrialing: "ssb-ax-trialing",
  axActive: "ssb-ax-active",
  axPastDue: "ssb-ax-past-due",
  hmCancelled: "ssb-hm-cancelled",
  hmExpired: "ssb-hm-expired",
} as const;

export const STORE_EXTERNAL_SUB = {
  axTrialing: "subref-ax-01",
  axActive: "subref-ax-02",
  axPastDue: "subref-ax-03",
  hmCancelled: "subref-hm-01",
  hmExpired: "subref-hm-02",
} as const;

export const AFFILIATE = {
  axPartner: "aff-ax-partner",
  hmPartner: "aff-hm-partner",
} as const;

export const AFFILIATE_CONVERSION = {
  axPending: "afc-ax-pending",
  axApproved: "afc-ax-approved",
  axPaid: "afc-ax-paid",
  hmReversed: "afc-hm-reversed",
} as const;
