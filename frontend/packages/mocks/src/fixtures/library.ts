import type {
  CatalogueRecord,
  Hold,
  LibraryCopy,
  LibraryFine,
  Loan,
  ReadingRecommendation,
} from "@nexus/contracts";
import { CAMPUS, INSTITUTION, PERSON, TENANT } from "./ids";
import { FEE_INVOICE, LEARNER } from "./ids-stage3";
import {
  CATALOGUE_RECORD as RECORD,
  LIBRARY_BARCODE as BARCODE,
  LIBRARY_CLIENT as CLIENT,
  LIBRARY_COPY as COPY,
  LIBRARY_DESK_RECEIPT,
  LIBRARY_DIGITAL_RESOURCE,
  LIBRARY_FINE as FINE,
  LIBRARY_HOLD as HOLD,
  LIBRARY_LOAN as LOAN,
} from "./ids-stage4-more";
import { LEARNERS } from "./learner-records";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const rv = TENANT.riverside;
const nb = TENANT.northbridge;

function staffId(tenantId: string, personId: string) {
  const staff = ROLE_PROFILES.find(
    (row) => row.tenantId === tenantId && row.personId === personId && row.kind === "staff",
  );
  if (!staff) throw new Error("Missing library staff profile for " + personId);
  return staff.id;
}

function learnerProfileId(tenantId: string, learnerId: string) {
  const learner = LEARNERS.find((row) => row.tenantId === tenantId && row.id === learnerId);
  if (!learner) throw new Error("Missing library borrower for " + learnerId);
  return learner.roleProfileId;
}

const rvStaff = staffId(rv, PERSON.rvAmira);
const nbStaff = staffId(nb, PERSON.nbElena);
const nbBorrowingStaff = staffId(nb, PERSON.nbMarcus);
const rvBorrowingStaff = staffId(rv, PERSON.rvTom);
const mia = learnerProfileId(rv, LEARNER.rvMia);
const leo = learnerProfileId(rv, LEARNER.rvLeo);
const jordan = learnerProfileId(nb, LEARNER.nbJordan);
const aiden = learnerProfileId(nb, LEARNER.nbAiden);
const rvBranch = { tenantId: rv, institutionId: INSTITUTION.riversideSchool, language: "en-GB" };
const nbBranch = { tenantId: nb, institutionId: INSTITUTION.northbridge, language: "en-US" };
const catalogueDefaults = {
  kind: "book",
  authors: [],
  isbn: null,
  publisher: null,
  year: null,
  classification: null,
  digitalAccess: null,
  source: "manual",
  confirmedByStaffProfileId: null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
} satisfies Partial<CatalogueRecord>;

export const CATALOGUE_RECORDS: readonly CatalogueRecord[] = [
  {
    ...catalogueDefaults,
    ...rvBranch,
    id: RECORD.rvPonds,
    title: "Pond Life Sketchbook",
    subjects: ["Freshwater habitats"],
    summary: "Illustrated observations of life in a fictional pond.",
    source: "ai_photo",
    confirmedByStaffProfileId: rvStaff,
  },
  {
    ...catalogueDefaults,
    ...rvBranch,
    id: RECORD.rvRivers,
    title: "River Habitats Field Guide",
    subjects: ["Freshwater habitats"],
    summary: "Field activities on freshwater plants and insects.",
    kind: "digital_resource",
    digitalAccess: { provider: "demo_library", externalId: LIBRARY_DIGITAL_RESOURCE },
  },
  {
    ...catalogueDefaults,
    ...nbBranch,
    id: RECORD.nbAlgorithms,
    title: "Algorithms by Hand",
    subjects: ["Algorithms"],
    summary: "Worked examples with a focus on tracing and testing.",
  },
  {
    ...catalogueDefaults,
    ...nbBranch,
    id: RECORD.nbGraphs,
    title: "Graph Problems for the Lab",
    subjects: ["Algorithms"],
    summary: "Graph traversal exercises for introductory computing.",
  },
];

type CopyKey = keyof typeof COPY;
type CopySpec = [CopyKey, string, "riverside" | "northbridge", LibraryCopy["status"]];
const copySpecs: CopySpec[] = [
  ["rvAvailable", RECORD.rvPonds, "riverside", "available"],
  ["rvLoaned", RECORD.rvPonds, "riverside", "on_loan"],
  ["rvHeld", RECORD.rvPonds, "riverside", "on_hold"],
  ["rvRepair", RECORD.rvPonds, "riverside", "in_repair"],
  ["nbOverdue", RECORD.nbAlgorithms, "northbridge", "on_loan"],
  ["nbLost", RECORD.nbAlgorithms, "northbridge", "lost"],
  ["nbWithdrawn", RECORD.nbGraphs, "northbridge", "withdrawn"],
];

export const LIBRARY_COPIES: readonly LibraryCopy[] = copySpecs.map(
  ([key, recordId, branch, status]) => ({
    id: COPY[key],
    tenantId: TENANT[branch],
    recordId,
    barcode: BARCODE[key],
    campusId: branch === "riverside" ? CAMPUS.riversideSouth : CAMPUS.northbridge,
    shelf: "Study collection",
    status,
    acquiredOn: "2026-09-02",
    price: null,
    currency: null,
  }),
);

const date = (monthDay: string) => "2026-" + monthDay;
const at = (monthDay: string) => date(monthDay) + "T10:00:00Z";
type LoanSpec = [
  keyof typeof LOAN,
  CopyKey,
  string,
  Loan["borrowerKind"],
  Loan["status"],
  string,
  string,
  string?,
];
const loanSpecs: LoanSpec[] = [
  ["rvActive", "rvLoaned", leo, "learner", "active", "11-24", "12-08"],
  ["rvReturned", "rvAvailable", mia, "learner", "returned", "09-04", "09-18", "09-16"],
  ["rvDamaged", "rvRepair", rvBorrowingStaff, "staff", "returned", "10-02", "10-16", "10-10"],
  ["nbOverdue", "nbOverdue", nbBorrowingStaff, "staff", "overdue", "10-21", "11-04"],
  ["nbLost", "nbLost", aiden, "learner", "lost", "10-16", "10-30"],
  ["nbReturned", "nbWithdrawn", jordan, "learner", "returned", "09-03", "09-17", "09-25"],
];

export const LIBRARY_LOANS: readonly Loan[] = loanSpecs.map(
  ([key, copyKey, borrowerProfileId, borrowerKind, status, issuedOn, dueOn, returnedOn]) => {
    const copyId = COPY[copyKey];
    const item = LIBRARY_COPIES.find((row) => row.id === copyId);
    if (!item) throw new Error("Missing library copy " + copyId);
    return {
      id: LOAN[key],
      tenantId: item.tenantId,
      copyId,
      borrowerProfileId,
      borrowerKind,
      issuedAt: at(issuedOn),
      dueOn: date(dueOn),
      renewals: 0,
      status,
      returnedAt: returnedOn ? at(returnedOn) : null,
      issuedByStaffProfileId: item.tenantId === rv ? rvStaff : nbStaff,
      clientId: CLIENT[key],
      deviceId: null,
    };
  },
);

type HoldSpec = [
  id: string,
  tenantId: string,
  borrowerProfileId: string,
  day: string,
  position: number,
  status: Hold["status"],
  readyThrough?: string,
];
const holdSpecs: HoldSpec[] = [
  [HOLD.rvWaiting, rv, mia, "11-25", 2, "waiting"],
  [HOLD.rvReady, rv, rvBorrowingStaff, "11-23", 1, "ready", "11-30"],
  [HOLD.rvFulfilled, rv, leo, "11-20", 1, "fulfilled"],
  [HOLD.nbCancelled, nb, jordan, "10-02", 1, "cancelled"],
  [HOLD.nbExpired, nb, jordan, "11-05", 1, "expired"],
];
export const LIBRARY_HOLDS: readonly Hold[] = holdSpecs.map(
  ([id, tenantId, borrowerProfileId, day, position, status, readyThrough]) => ({
    id,
    tenantId,
    recordId: tenantId === rv ? RECORD.rvPonds : RECORD.nbAlgorithms,
    borrowerProfileId,
    placedAt: at(day),
    position,
    status,
    readyUntil: readyThrough ? at(readyThrough) : null,
  }),
);

const fineDefaults = {
  feeInvoiceId: null,
  deskReceiptNumber: null,
  waivedByStaffProfileId: null,
  waiveReason: null,
};
export const LIBRARY_FINES: readonly LibraryFine[] = [
  {
    ...fineDefaults,
    id: FINE.rvWaived,
    tenantId: rv,
    loanId: LOAN.rvDamaged,
    borrowerProfileId: rvBorrowingStaff,
    reason: "damage",
    amount: 600,
    currency: "GBP",
    status: "waived",
    waivedByStaffProfileId: rvStaff,
    waiveReason: "The binding defect predated the loan.",
  },
  {
    ...fineDefaults,
    id: FINE.nbOpen,
    tenantId: nb,
    loanId: LOAN.nbOverdue,
    borrowerProfileId: nbBorrowingStaff,
    reason: "overdue",
    amount: 300,
    currency: "USD",
    status: "open",
  },
  {
    ...fineDefaults,
    id: FINE.nbInvoiced,
    tenantId: nb,
    loanId: LOAN.nbLost,
    borrowerProfileId: aiden,
    reason: "lost",
    amount: 2500,
    currency: "USD",
    status: "invoiced",
    feeInvoiceId: FEE_INVOICE.nb[2],
  },
  {
    ...fineDefaults,
    id: FINE.nbPaid,
    tenantId: nb,
    loanId: LOAN.nbReturned,
    borrowerProfileId: jordan,
    reason: "overdue",
    amount: 200,
    currency: "USD",
    status: "paid",
    deskReceiptNumber: LIBRARY_DESK_RECEIPT,
  },
];

export const READING_RECOMMENDATIONS: readonly ReadingRecommendation[] = [
  {
    tenantId: rv,
    borrowerProfileId: mia,
    recordId: RECORD.rvRivers,
    reason: "Continue exploring freshwater habitats after returning Pond Life Sketchbook.",
    aiGenerated: true,
    tier: "fast",
    createdAt: "2026-09-17T10:00:00Z",
  },
  {
    tenantId: nb,
    borrowerProfileId: jordan,
    recordId: RECORD.nbAlgorithms,
    reason: "Try more algorithm exercises after returning Graph Problems for the Lab.",
    aiGenerated: true,
    tier: "fast",
    createdAt: "2026-09-26T10:00:00Z",
  },
];
