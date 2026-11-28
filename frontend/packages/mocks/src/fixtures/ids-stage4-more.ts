export const CATALOGUE_RECORD = {
  rvPonds: "lcr-rv-ponds",
  rvRivers: "lcr-rv-rivers",
  nbAlgorithms: "lcr-nb-algorithms",
  nbGraphs: "lcr-nb-graphs",
} as const;

export const LIBRARY_COPY = {
  rvAvailable: "lcp-rv-available",
  rvLoaned: "lcp-rv-loaned",
  rvHeld: "lcp-rv-held",
  rvRepair: "lcp-rv-repair",
  nbOverdue: "lcp-nb-overdue",
  nbLost: "lcp-nb-lost",
  nbWithdrawn: "lcp-nb-withdrawn",
} as const;

export const LIBRARY_LOAN = {
  rvActive: "lln-rv-active",
  rvReturned: "lln-rv-returned",
  rvDamaged: "lln-rv-damaged",
  nbOverdue: "lln-nb-overdue",
  nbLost: "lln-nb-lost",
  nbReturned: "lln-nb-returned",
} as const;

export const LIBRARY_HOLD = {
  rvWaiting: "lhd-rv-waiting",
  rvReady: "lhd-rv-ready",
  rvFulfilled: "lhd-rv-fulfilled",
  nbCancelled: "lhd-nb-cancelled",
  nbExpired: "lhd-nb-expired",
} as const;

export const LIBRARY_FINE = {
  rvWaived: "lfn-rv-waived",
  nbOpen: "lfn-nb-open",
  nbInvoiced: "lfn-nb-invoiced",
  nbPaid: "lfn-nb-paid",
} as const;

export const TEST_SERIES = {
  axDraft: "tse-ax-draft",
  axActive: "tse-ax-active",
  axCompleted: "tse-ax-completed",
} as const;

export const DOUBT = {
  axOpen: "dbt-ax-open",
  axAiAnswered: "dbt-ax-ai-answered",
  axAnswered: "dbt-ax-answered",
  axClosed: "dbt-ax-closed",
} as const;

export const DOUBT_ANSWER = {
  axAi: "dba-ax-ai",
  axStaff: "dba-ax-staff",
  axClosed: "dba-ax-closed",
} as const;

export const WEAK_TOPIC_PLAN = { axDraft: "wtp-ax-draft", axShared: "wtp-ax-shared" } as const;
export const PARENT_REPORT = { axDraft: "prt-ax-draft", axSent: "prt-ax-sent" } as const;

export const CATALOGUE_COURSE = {
  hmPiano: "scc-hm-piano",
  hmDraft: "scc-hm-draft",
  hmRetired: "scc-hm-retired",
} as const;

export const SESSION_PACK = { hmStudio: "spk-hm-studio", hmTrial: "spk-hm-trial" } as const;

export const PACK_PURCHASE = {
  hmActive: "spp-hm-active",
  hmExhausted: "spp-hm-exhausted",
  hmExpired: "spp-hm-expired",
  hmRefunded: "spp-hm-refunded",
} as const;

export const CLASS_SESSION = {
  hmRegular: "css-hm-regular",
  hmTrial: "css-hm-trial",
  hmMakeUp: "css-hm-make-up",
  hmScheduled: "css-hm-scheduled",
  hmCancelled: "css-hm-cancelled",
  hmReleased: "css-hm-released",
} as const;

export const SESSION_BOOKING = {
  hmBooked: "sbk-hm-booked",
  hmAttended: "sbk-hm-attended",
  hmMissed: "sbk-hm-missed",
  hmMakeUp: "sbk-hm-make-up",
  hmLearnerCancelled: "sbk-hm-learner-cancelled",
  hmInstitutionCancelled: "sbk-hm-institution-cancelled",
} as const;

export const LEVEL_EXAM = {
  hmPending: "lex-hm-pending",
  hmPass: "lex-hm-pass",
  hmMerit: "lex-hm-merit",
  hmDistinction: "lex-hm-distinction",
  hmFail: "lex-hm-fail",
} as const;

export const PRACTICE_FEEDBACK = { hmDraft: "pfb-hm-draft", hmShared: "pfb-hm-shared" } as const;
export const PRACTICE_MEDIA = {
  hmDraft: "med-hm-practice-draft",
  hmShared: "med-hm-practice-shared",
} as const;

export const LIBRARY_CLIENT = {
  rvActive: "b2580000-0000-4000-8000-000000000001",
  rvReturned: "b2580000-0000-4000-8000-000000000002",
  rvDamaged: "b2580000-0000-4000-8000-000000000003",
  nbOverdue: "b2580000-0000-4000-8000-000000000004",
  nbLost: "b2580000-0000-4000-8000-000000000005",
  nbReturned: "b2580000-0000-4000-8000-000000000006",
} as const;

export const DOUBT_CLIENT = {
  axOpen: "b2580000-0000-4000-8000-000000000007",
  axAiAnswered: "b2580000-0000-4000-8000-000000000008",
  axAnswered: "b2580000-0000-4000-8000-000000000009",
  axClosed: "b2580000-0000-4000-8000-000000000010",
} as const;

export const BOOKING_CLIENT = {
  hmBooked: "b2580000-0000-4000-8000-000000000011",
  hmAttended: "b2580000-0000-4000-8000-000000000012",
  hmMissed: "b2580000-0000-4000-8000-000000000013",
  hmMakeUp: "b2580000-0000-4000-8000-000000000014",
  hmLearnerCancelled: "b2580000-0000-4000-8000-000000000015",
  hmInstitutionCancelled: "b2580000-0000-4000-8000-000000000016",
} as const;

export const LIBRARY_BARCODE = {
  rvAvailable: "RV-101",
  rvLoaned: "RV-102",
  rvHeld: "RV-103",
  rvRepair: "RV-104",
  nbOverdue: "NB-201",
  nbLost: "NB-202",
  nbWithdrawn: "NB-203",
} as const;

export const LIBRARY_DESK_RECEIPT = "NB-LIB-001";
export const LIBRARY_DIGITAL_RESOURCE = "river-field-guide";
