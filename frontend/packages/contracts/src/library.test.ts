import { describe, expect, it } from "vitest";
import {
  CatalogueRecordSchema,
  HoldSchema,
  IsbnSchema,
  LibraryCopySchema,
  LibraryFineSchema,
  LoanSchema,
  ReadingRecommendationSchema,
  type CatalogueKind,
  type CatalogueRecord,
  type Hold,
  type LibraryCopy,
  type LibraryCopyStatus,
  type LibraryFine,
  type Loan,
} from "./index";

const record: CatalogueRecord = {
  id: "record-wonder",
  tenantId: "tenant-school",
  institutionId: "institution-school",
  kind: "book",
  title: "Wonder",
  authors: ["R. J. Palacio"],
  isbn: "9780375869020",
  publisher: "Knopf",
  year: 2012,
  language: "en-IN",
  subjects: ["Friendship"],
  classification: "813.6",
  summary: "A boy starts school for the first time.",
  digitalAccess: null,
  source: "manual",
  confirmedByStaffProfileId: null,
  createdAt: "2026-06-01T08:00:00Z",
  updatedAt: "2026-06-01T08:00:00Z",
};
const copy: LibraryCopy = {
  id: "copy-wonder-1",
  tenantId: "tenant-school",
  recordId: record.id,
  barcode: "LIB-00017",
  campusId: "campus-main",
  shelf: "F-PAL",
  status: "on_loan",
  acquiredOn: "2025-04-01",
  price: 39900,
  currency: "INR",
};
const loan: Loan = {
  id: "loan-1",
  tenantId: "tenant-school",
  copyId: copy.id,
  borrowerProfileId: "learner-aarav",
  borrowerKind: "learner",
  issuedAt: "2026-07-01T05:00:00Z",
  dueOn: "2026-07-15",
  renewals: 0,
  status: "active",
  returnedAt: null,
  issuedByStaffProfileId: "staff-librarian",
  clientId: "5d0c9e8f-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
  deviceId: null,
};
const hold: Hold = {
  id: "hold-1",
  tenantId: "tenant-school",
  recordId: record.id,
  borrowerProfileId: "learner-meera",
  placedAt: "2026-07-02T05:00:00Z",
  position: 1,
  status: "ready",
  readyUntil: "2026-07-20T12:00:00Z",
};
const fine: LibraryFine = {
  id: "fine-1",
  tenantId: "tenant-school",
  loanId: loan.id,
  borrowerProfileId: "learner-aarav",
  reason: "overdue",
  amount: 500,
  currency: "INR",
  status: "invoiced",
  feeInvoiceId: "fee-invoice-17",
  deskReceiptNumber: null,
  waivedByStaffProfileId: null,
  waiveReason: null,
};

describe("ISBN", () => {
  it("accepts valid ISBN-10 (with X) and ISBN-13", () => {
    for (const isbn of ["0306406152", "080442957X", "9780306406157", "9780375869020"]) {
      expect(IsbnSchema.safeParse(isbn).success).toBe(true);
    }
  });

  it("rejects bad check digits and formats", () => {
    for (const isbn of ["0306406153", "9780306406158", "978-0306406157", "X306406152", "12345"]) {
      expect(IsbnSchema.safeParse(isbn).success).toBe(false);
    }
  });
});

describe("catalogue records and copies", () => {
  it("accepts each kind and an AI-photo record confirmed by staff", () => {
    const kinds: CatalogueKind[] = ["book", "journal", "audio", "video"];
    for (const kind of kinds) {
      expect(CatalogueRecordSchema.safeParse({ ...record, kind }).success).toBe(true);
    }
    const ebook = {
      ...record,
      kind: "ebook",
      digitalAccess: { provider: "demo", externalId: "ebook-77" },
    };
    expect(CatalogueRecordSchema.safeParse(ebook).success).toBe(true);
    expect(CatalogueRecordSchema.safeParse({ ...ebook, kind: "digital_resource" }).success).toBe(
      true,
    );
    const aiPhoto = { ...record, source: "ai_photo", confirmedByStaffProfileId: "staff-librarian" };
    expect(CatalogueRecordSchema.safeParse(aiPhoto).success).toBe(true);
  });

  it("rejects missing digital access and unconfirmed lookups", () => {
    expect(CatalogueRecordSchema.safeParse({ ...record, kind: "ebook" }).success).toBe(false);
    expect(CatalogueRecordSchema.safeParse({ ...record, source: "ai_photo" }).success).toBe(false);
    expect(CatalogueRecordSchema.safeParse({ ...record, source: "isbn_lookup" }).success).toBe(
      false,
    );
    expect(CatalogueRecordSchema.safeParse({ ...record, isbn: "9780375869021" }).success).toBe(
      false,
    );
  });

  it("accepts each copy status and pairs price with currency", () => {
    const statuses: LibraryCopyStatus[] = [
      "available",
      "on_loan",
      "on_hold",
      "in_repair",
      "lost",
      "withdrawn",
    ];
    for (const status of statuses) {
      expect(LibraryCopySchema.safeParse({ ...copy, status }).success).toBe(true);
    }
    expect(LibraryCopySchema.safeParse({ ...copy, price: null, currency: null }).success).toBe(
      true,
    );
    expect(LibraryCopySchema.safeParse({ ...copy, currency: null }).success).toBe(false);
    expect(LibraryCopySchema.safeParse({ ...copy, barcode: "lib 17" }).success).toBe(false);
  });
});

describe("loans and holds", () => {
  it("accepts each loan status and each hold status", () => {
    expect(LoanSchema.safeParse(loan).success).toBe(true);
    expect(LoanSchema.safeParse({ ...loan, status: "overdue", renewals: 2 }).success).toBe(true);
    expect(LoanSchema.safeParse({ ...loan, status: "lost" }).success).toBe(true);
    expect(
      LoanSchema.safeParse({ ...loan, status: "returned", returnedAt: "2026-07-10T05:00:00Z" })
        .success,
    ).toBe(true);
    expect(HoldSchema.safeParse(hold).success).toBe(true);
    for (const status of ["waiting", "fulfilled", "cancelled", "expired"] as const) {
      expect(HoldSchema.safeParse({ ...hold, status, readyUntil: null }).success).toBe(true);
    }
  });

  it("rejects bad loans and holds", () => {
    expect(LoanSchema.safeParse({ ...loan, status: "returned" }).success).toBe(false);
    expect(LoanSchema.safeParse({ ...loan, dueOn: "2026-06-30" }).success).toBe(false);
    expect(LoanSchema.safeParse({ ...loan, renewals: 11 }).success).toBe(false);
    expect(HoldSchema.safeParse({ ...hold, readyUntil: null }).success).toBe(false);
    expect(HoldSchema.safeParse({ ...hold, position: 0 }).success).toBe(false);
  });
});

describe("fines and recommendations", () => {
  it("accepts each fine status and a recommendation", () => {
    expect(LibraryFineSchema.safeParse(fine).success).toBe(true);
    expect(LibraryFineSchema.safeParse({ ...fine, status: "paid" }).success).toBe(true);
    expect(
      LibraryFineSchema.safeParse({ ...fine, status: "open", feeInvoiceId: null }).success,
    ).toBe(true);
    const waived = {
      ...fine,
      status: "waived",
      feeInvoiceId: null,
      waivedByStaffProfileId: "staff-librarian",
      waiveReason: "First late return.",
    };
    expect(LibraryFineSchema.safeParse(waived).success).toBe(true);
    const recommendation = {
      tenantId: "tenant-school",
      borrowerProfileId: "learner-aarav",
      recordId: record.id,
      reason: "You enjoyed two other books about friendship.",
      aiGenerated: true,
      tier: "fast",
      createdAt: "2026-07-11T05:00:00Z",
    };
    expect(ReadingRecommendationSchema.safeParse(recommendation).success).toBe(true);
    expect(
      ReadingRecommendationSchema.safeParse({ ...recommendation, aiGenerated: false }).success,
    ).toBe(false);
  });

  it("rejects bad fines", () => {
    expect(LibraryFineSchema.safeParse({ ...fine, feeInvoiceId: null }).success).toBe(false);
    expect(
      LibraryFineSchema.safeParse({ ...fine, status: "waived", feeInvoiceId: null }).success,
    ).toBe(false);
    expect(LibraryFineSchema.safeParse({ ...fine, amount: 0 }).success).toBe(false);
    const deskPaid = {
      ...fine,
      status: "paid",
      feeInvoiceId: null,
      deskReceiptNumber: "LIB-R-0042",
    };
    expect(LibraryFineSchema.safeParse(deskPaid).success).toBe(true);
    expect(
      LibraryFineSchema.safeParse({ ...deskPaid, feeInvoiceId: "fee-invoice-17" }).success,
    ).toBe(false);
    expect(LibraryFineSchema.safeParse({ ...deskPaid, deskReceiptNumber: null }).success).toBe(
      false,
    );
    expect(LibraryFineSchema.safeParse({ ...fine, deskReceiptNumber: "LIB-R-0042" }).success).toBe(
      false,
    );
  });
});
