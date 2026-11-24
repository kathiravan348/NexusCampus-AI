/** Stable IDs for the Stage 3 demo fixtures (D16). */

export const PROGRAM = {
  littleSteps: "prg-little-steps",
  riverside: "prg-riverside",
  northbridge: "prg-northbridge",
  apex: "prg-apex",
  harmony: "prg-harmony",
} as const;

export const YEAR_LEVEL = {
  lsSeedlings: "ylv-ls-seedlings",
  lsExplorer: "ylv-ls-explorer",
  rvYearFive: "ylv-rv-year-five",
  rvYearSeven: "ylv-rv-year-seven",
  rvYearNine: "ylv-rv-year-nine",
  rvYearTen: "ylv-rv-year-ten",
  nbFirstYear: "ylv-nb-first-year",
  nbSecondYear: "ylv-nb-second-year",
  axFoundation: "ylv-ax-foundation",
  axAdvanced: "ylv-ax-advanced",
  hmBeginner: "ylv-hm-beginner",
  hmIntermediate: "ylv-hm-intermediate",
} as const;

export const CLASS_GROUP = {
  lsSeedlings: "clg-ls-seedlings",
  lsExplorer: "clg-ls-explorer",
  rvSouthYearFive: "clg-rv-south-year-five",
  rvSouthYearSeven: "clg-rv-south-year-seven",
  rvNorthYearNine: "clg-rv-north-year-nine",
  rvNorthYearTen: "clg-rv-north-year-ten",
  nbFirstYear: "clg-nb-first-year",
  nbSecondYear: "clg-nb-second-year",
  axFoundation: "clg-ax-foundation",
  axAdvanced: "clg-ax-advanced",
  hmBeginner: "clg-hm-beginner",
  hmIntermediate: "clg-hm-intermediate",
} as const;

export const SUBJECT = {
  lsStory: "sub-ls-story",
  lsPlay: "sub-ls-play",
  lsNature: "sub-ls-nature",
  lsRhythm: "sub-ls-rhythm",
  rvEnglish: "sub-rv-english",
  rvMaths: "sub-rv-maths",
  rvScience: "sub-rv-science",
  rvHistory: "sub-rv-history",
  nbProgramming: "sub-nb-programming",
  nbComputingMath: "sub-nb-computing-math",
  nbDatabases: "sub-nb-databases",
  nbSystems: "sub-nb-systems",
  axAlgebra: "sub-ax-algebra",
  axMechanics: "sub-ax-mechanics",
  axCalculus: "sub-ax-calculus",
  axElectricity: "sub-ax-electricity",
  hmPiano: "sub-hm-piano",
  hmEarTraining: "sub-hm-ear-training",
  hmTheory: "sub-hm-theory",
  hmEnsemble: "sub-hm-ensemble",
} as const;

export const OFFERING = {
  lsSeedlings: ["off-ls-seedlings-1", "off-ls-seedlings-2"],
  lsExplorer: ["off-ls-explorer-1", "off-ls-explorer-2"],
  rvSouthYearFive: ["off-rv-south-year-five-1", "off-rv-south-year-five-2"],
  rvSouthYearSeven: ["off-rv-south-year-seven-1", "off-rv-south-year-seven-2"],
  rvNorthYearNine: ["off-rv-north-year-nine-1", "off-rv-north-year-nine-2"],
  rvNorthYearTen: ["off-rv-north-year-ten-1", "off-rv-north-year-ten-2"],
  nbFirstYear: ["off-nb-first-year-1", "off-nb-first-year-2"],
  nbSecondYear: ["off-nb-second-year-1", "off-nb-second-year-2"],
  axFoundation: ["off-ax-foundation-1", "off-ax-foundation-2"],
  axAdvanced: ["off-ax-advanced-1", "off-ax-advanced-2"],
  hmBeginner: ["off-hm-beginner-1", "off-hm-beginner-2"],
  hmIntermediate: ["off-hm-intermediate-1", "off-hm-intermediate-2"],
} as const;

export const LEARNER = {
  lsKavya: "lrn-ls-kavya",
  lsRohan: "lrn-ls-rohan",
  lsIshaan: "lrn-ls-ishaan",
  lsAnaya: "lrn-ls-anaya",
  rvOliver: "lrn-rv-oliver",
  rvMia: "lrn-rv-mia",
  rvLeo: "lrn-rv-leo",
  rvElla: "lrn-rv-ella",
  nbJordan: "lrn-nb-jordan",
  nbSofia: "lrn-nb-sofia",
  nbAiden: "lrn-nb-aiden",
  nbNora: "lrn-nb-nora",
  axVijay: "lrn-ax-vijay",
  axDivya: "lrn-ax-divya",
  axArun: "lrn-ax-arun",
  axNila: "lrn-ax-nila",
  hmEthan: "lrn-hm-ethan",
  hmChloe: "lrn-hm-chloe",
  hmRachel: "lrn-hm-rachel",
  hmMarcus: "lrn-hm-marcus",
} as const;

export const ENROLMENT = {
  lsKavya: "enr-ls-kavya",
  lsRohan: "enr-ls-rohan",
  lsIshaan: "enr-ls-ishaan",
  lsAnaya: "enr-ls-anaya",
  rvOliver: "enr-rv-oliver",
  rvMia: "enr-rv-mia",
  rvLeo: "enr-rv-leo",
  rvElla: "enr-rv-ella",
  nbJordan: "enr-nb-jordan",
  nbSofia: "enr-nb-sofia",
  nbAiden: "enr-nb-aiden",
  nbNora: "enr-nb-nora",
  axVijay: "enr-ax-vijay",
  axDivya: "enr-ax-divya",
  axArun: "enr-ax-arun",
  axNila: "enr-ax-nila",
  hmEthan: "enr-hm-ethan",
  hmChloe: "enr-hm-chloe",
  hmRachel: "enr-hm-rachel",
  hmMarcus: "enr-hm-marcus",
} as const;

export const LEARNER_DOCUMENT = {
  littleSteps: "lrd-little-steps",
  riverside: "lrd-riverside",
  northbridge: "lrd-northbridge",
  apex: "lrd-apex",
  harmony: "lrd-harmony",
} as const;

export const HOUSEHOLD = {
  lsMehta: "hhd-ls-mehta",
  lsRao: "hhd-ls-rao",
  lsIyer: "hhd-ls-iyer",
  rvBennett: "hhd-rv-bennett",
  rvShah: "hhd-rv-shah",
  rvPrice: "hhd-rv-price",
  nbLee: "hhd-nb-lee",
  nbGomez: "hhd-nb-gomez",
  nbClark: "hhd-nb-clark",
  nbPatel: "hhd-nb-patel",
  axRajan: "hhd-ax-rajan",
  axMurugan: "hhd-ax-murugan",
  axPrakash: "hhd-ax-prakash",
  axSelvam: "hhd-ax-selvam",
  hmKoh: "hhd-hm-koh",
  hmChen: "hhd-hm-chen",
  hmLim: "hhd-hm-lim",
  hmOng: "hhd-hm-ong",
} as const;

export const GUARDIAN_RELATIONSHIP = {
  lsKavya: "grl-ls-kavya",
  lsRohan: "grl-ls-rohan",
  lsIshaan: "grl-ls-ishaan",
  lsAnaya: "grl-ls-anaya",
  rvOliver: "grl-rv-oliver",
  rvMia: "grl-rv-mia",
  rvLeo: "grl-rv-leo",
  rvElla: "grl-rv-ella",
  nbJordan: "grl-nb-jordan",
  nbSofia: "grl-nb-sofia",
  axVijay: "grl-ax-vijay",
  axDivya: "grl-ax-divya",
  hmEthan: "grl-hm-ethan",
  hmChloe: "grl-hm-chloe",
} as const;

export const AUTHORISED_PICKUP = {
  littleSteps: "pku-little-steps",
  riverside: "pku-riverside",
  northbridge: "pku-northbridge",
  apex: "pku-apex",
  harmony: "pku-harmony",
} as const;

export const CUSTOM_FIELD = {
  littleSteps: { studyInterest: "cfd-ls-interest", supportNote: "cfd-ls-support" },
  riverside: { studyInterest: "cfd-rv-interest", supportNote: "cfd-rv-support" },
  northbridge: { studyInterest: "cfd-nb-interest", supportNote: "cfd-nb-support" },
  apex: { studyInterest: "cfd-ax-interest", supportNote: "cfd-ax-support" },
  harmony: { studyInterest: "cfd-hm-interest", supportNote: "cfd-hm-support" },
} as const;

export const FORM = {
  littleSteps: "frm-little-steps",
  riverside: "frm-riverside",
  northbridge: "frm-northbridge",
  apex: "frm-apex",
  harmony: "frm-harmony",
} as const;

export const WORKFLOW = {
  littleSteps: "wfl-little-steps",
  riverside: "wfl-riverside",
  northbridge: "wfl-northbridge",
  apex: "wfl-apex",
  harmony: "wfl-harmony",
} as const;

export const WORKFLOW_STEP = {
  littleSteps: "wfs-little-steps",
  riverside: "wfs-riverside",
  northbridge: "wfs-northbridge",
  apex: "wfs-apex",
  harmony: "wfs-harmony",
} as const;

export const NUMBERING_FORMAT = {
  littleSteps: "num-little-steps",
  riverside: "num-riverside",
  northbridge: "num-northbridge",
  apex: "num-apex",
  harmony: "num-harmony",
} as const;

export type OpsTenantSlug = "ls" | "rv" | "nb" | "ax" | "hm";

const t1 = <P extends string>(p: P) =>
  ({ ls: `${p}-ls`, rv: `${p}-rv`, nb: `${p}-nb`, ax: `${p}-ax`, hm: `${p}-hm` }) as const;
const t2 = <P extends string>(p: P) =>
  ({
    ls: [`${p}-ls-1`, `${p}-ls-2`],
    rv: [`${p}-rv-1`, `${p}-rv-2`],
    nb: [`${p}-nb-1`, `${p}-nb-2`],
    ax: [`${p}-ax-1`, `${p}-ax-2`],
    hm: [`${p}-hm-1`, `${p}-hm-2`],
  }) as const;
const t3 = <P extends string>(p: P) =>
  ({
    ls: [`${p}-ls-1`, `${p}-ls-2`, `${p}-ls-3`],
    rv: [`${p}-rv-1`, `${p}-rv-2`, `${p}-rv-3`],
    nb: [`${p}-nb-1`, `${p}-nb-2`, `${p}-nb-3`],
    ax: [`${p}-ax-1`, `${p}-ax-2`, `${p}-ax-3`],
    hm: [`${p}-hm-1`, `${p}-hm-2`, `${p}-hm-3`],
  }) as const;

export const ENQUIRY = t3("enq");
export const APPLICATION = t2("app");
export const ADMISSION_OFFER = t1("ofr");
export const WAITLIST_ENTRY = t1("wlt");
export const IMPORT_JOB = t2("imp");
export const NEXT_ACADEMIC_YEAR = t1("cal-next");
export const ROLLOVER_RUN = t1("rlv");
export const promotionDecisionId = (learnerId: string): string =>
  `pmd-${learnerId.replace(/^lrn-/, "")}`;

export const ROOM = {
  ls: ["rom-ls-1", "rom-ls-2"],
  rvNorth: ["rom-rv-n1", "rom-rv-n2"],
  rvSouth: ["rom-rv-s1", "rom-rv-s2"],
  nb: ["rom-nb-1", "rom-nb-2"],
  ax: ["rom-ax-1", "rom-ax-2"],
  hm: ["rom-hm-1", "rom-hm-2"],
} as const;
export const BELL_SCHEDULE = t1("bel");
export const timetableSlotId = (classGroupId: string, slot: number): string =>
  `tts-${classGroupId.replace(/^clg-/, "")}-${slot}`;
export const attendanceSessionId = (slug: OpsTenantSlug, day: number): string =>
  `ats-${slug}-${day}`;
export const attendanceMarkId = (sessionId: string, learnerId: string): string =>
  `atm-${sessionId.replace(/^ats-/, "")}-${learnerId.replace(/^lrn-/, "")}`;
export const LEAVE_REQUEST = t2("lvr");

export const FEE_HEAD = t2("fhd");
export const FEE_PLAN = t1("fpl");
export const CONCESSION = t1("cnc");
export const FEE_INVOICE = t3("inv");
export const FEE_PAYMENT = t2("pay");
export const FEE_REFUND = t1("rfd");
export const LEDGER_ACCOUNT = t3("lac");
export const JOURNAL_ENTRY = t2("jrn");
export const BUDGET = t1("bdg");

export const GRADING_SCHEME = t1("grd");
export const RUBRIC = t1("rub");
export const ASSESSMENT = t2("asm");
export const markEntryId = (assessmentId: string, learnerId: string): string =>
  `mrk-${assessmentId.replace(/^asm-/, "")}-${learnerId.replace(/^lrn-/, "")}`;
export const EXAM = t1("exm");
export const EXAM_PAPER = t1("exp");
export const seatAssignmentId = (paperId: string, learnerId: string): string =>
  `sat-${paperId.replace(/^exp-/, "")}-${learnerId.replace(/^lrn-/, "")}`;
export const hallTicketId = (examId: string, learnerId: string): string =>
  `hlt-${examId.replace(/^exm-/, "")}-${learnerId.replace(/^lrn-/, "")}`;
export const REVALUATION_REQUEST = t1("rev");
export const REPORT_CARD = t1("rpc");
export const ISSUED_DOCUMENT = t1("doc");
export const REPORT_TEMPLATE = t1("tpl-rc");
export const DOCUMENT_TEMPLATE = t1("tpl-doc");

export const MESSAGE_THREAD = t2("thd");
export const threadMessageId = (threadId: string, seq: number): string =>
  `msg-${threadId.replace(/^thd-/, "")}-${seq}`;
export const NOTICE = t2("ntc");
export const MEETING_SLOT = t2("mts");
export const MEETING_BOOKING = t1("mtb");
