import { z } from "zod";
import { CapabilityTierSchema } from "./ai";
import {
  CurrencyCodeSchema,
  IdSchema,
  IsoDateSchema,
  LocaleSchema,
  MinorUnitsSchema,
  UtcDateTimeSchema,
} from "./common";

/**
 * M39 library (NEX-217, D87). Reading history is private (G-6, V-7): only the borrower and library staff see past loans;
 * guardians of a minor see current loans and fines only; returned loans are anonymised after the tenant's retention
 * period (fines are kept). AI cataloguing from an ISBN lookup or a photo is confirmed by a person before the record is
 * used; reading recommendations need the tenant AI switch and, for minors, a guardian's `ai_features` consent, and use
 * only the borrower's own history (A-3). Region packs may forbid fines for minors. Learner fines are collected through
 * M18 invoices.
 */

const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);

const isbn10Valid = (digits: string) => {
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const character = digits[index] ?? "";
    const value = character === "X" ? 10 : Number(character);
    sum += value * (10 - index);
  }
  return sum % 11 === 0;
};

const isbn13Valid = (digits: string) => {
  let sum = 0;
  for (let index = 0; index < 13; index += 1) {
    sum += Number(digits[index] ?? "") * (index % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
};

/** ISBN-10 (last character may be `X`) or ISBN-13, digits only, with a valid check digit. */
export const IsbnSchema = z
  .string()
  .regex(/^(\d{9}[\dX]|\d{13})$/)
  .refine((isbn) => (isbn.length === 10 ? isbn10Valid(isbn) : isbn13Valid(isbn)), {
    message: "ISBN check digit is wrong",
  });
export type Isbn = z.infer<typeof IsbnSchema>;

export const CatalogueKindSchema = z.enum([
  "book",
  "ebook",
  "journal",
  "audio",
  "video",
  "digital_resource",
]);
export type CatalogueKind = z.infer<typeof CatalogueKindSchema>;

export const CatalogueSourceSchema = z.enum(["manual", "isbn_lookup", "ai_photo"]);
export type CatalogueSource = z.infer<typeof CatalogueSourceSchema>;

const digitalKinds: ReadonlySet<CatalogueKind> = new Set(["ebook", "digital_resource"]);

export const CatalogueRecordSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    kind: CatalogueKindSchema,
    title: z.string().trim().min(1).max(500),
    authors: z.array(z.string().trim().min(1).max(200)).max(20),
    isbn: IsbnSchema.nullable(),
    publisher: z.string().trim().min(1).max(200).nullable(),
    year: z.int().min(1000).max(2100).nullable(),
    language: LocaleSchema,
    subjects: z.array(z.string().trim().min(1).max(100)).max(20),
    classification: z.string().trim().min(1).max(50).nullable(),
    summary: z.string().trim().max(4000),
    /** Set exactly for e-books and digital resources; the provider is a settings key. */
    digitalAccess: z
      .strictObject({
        provider: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
        externalId: z.string().trim().min(1).max(200),
      })
      .nullable(),
    source: CatalogueSourceSchema,
    /** Set exactly when the record came from a lookup or AI. */
    confirmedByStaffProfileId: IdSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((record) => isNotBefore(record.updatedAt, record.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  })
  .refine((record) => digitalKinds.has(record.kind) === (record.digitalAccess !== null), {
    message: "digitalAccess is set exactly for e-books and digital resources",
    path: ["digitalAccess"],
  })
  .refine(
    (record) => (record.source !== "manual") === (record.confirmedByStaffProfileId !== null),
    {
      message: "a looked-up or AI record is confirmed by a person",
      path: ["confirmedByStaffProfileId"],
    },
  );
export type CatalogueRecord = z.infer<typeof CatalogueRecordSchema>;

export const LibraryCopyStatusSchema = z.enum([
  "available",
  "on_loan",
  "on_hold",
  "in_repair",
  "lost",
  "withdrawn",
]);
export type LibraryCopyStatus = z.infer<typeof LibraryCopyStatusSchema>;

export const LibraryCopySchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    recordId: IdSchema,
    barcode: z.string().regex(/^[A-Z0-9-]{4,32}$/),
    campusId: IdSchema.nullable(),
    shelf: z.string().trim().min(1).max(50).nullable(),
    status: LibraryCopyStatusSchema,
    acquiredOn: IsoDateSchema.nullable(),
    price: MinorUnitsSchema.min(0).nullable(),
    currency: CurrencyCodeSchema.nullable(),
  })
  .refine((copy) => (copy.price === null) === (copy.currency === null), {
    message: "price and currency are set together",
    path: ["currency"],
  });
export type LibraryCopy = z.infer<typeof LibraryCopySchema>;

export const LoanStatusSchema = z.enum(["active", "overdue", "returned", "lost"]);
export type LoanStatus = z.infer<typeof LoanStatusSchema>;

export const LoanSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    copyId: IdSchema,
    borrowerProfileId: IdSchema,
    borrowerKind: z.enum(["learner", "staff"]),
    issuedAt: UtcDateTimeSchema,
    dueOn: IsoDateSchema,
    renewals: z.int().min(0).max(10),
    status: LoanStatusSchema,
    returnedAt: UtcDateTimeSchema.nullable(),
    issuedByStaffProfileId: IdSchema,
    /** Offline outbox client id (L2). */
    clientId: z.uuid(),
    deviceId: IdSchema.nullable(),
  })
  .refine((loan) => loan.dueOn >= loan.issuedAt.slice(0, 10), {
    message: "dueOn is before the issue date",
    path: ["dueOn"],
  })
  .refine((loan) => (loan.status === "returned") === (loan.returnedAt !== null), {
    message: "returnedAt is set exactly when the loan is returned",
    path: ["returnedAt"],
  })
  .refine((loan) => loan.returnedAt === null || isNotBefore(loan.returnedAt, loan.issuedAt), {
    message: "returnedAt is before issuedAt",
    path: ["returnedAt"],
  });
export type Loan = z.infer<typeof LoanSchema>;

export const HoldStatusSchema = z.enum(["waiting", "ready", "fulfilled", "cancelled", "expired"]);
export type HoldStatus = z.infer<typeof HoldStatusSchema>;

export const HoldSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    recordId: IdSchema,
    borrowerProfileId: IdSchema,
    placedAt: UtcDateTimeSchema,
    position: z.int().min(1),
    status: HoldStatusSchema,
    readyUntil: UtcDateTimeSchema.nullable(),
  })
  .refine((hold) => (hold.status === "ready") === (hold.readyUntil !== null), {
    message: "readyUntil is set exactly when the hold is ready",
    path: ["readyUntil"],
  })
  .refine(
    (hold) => hold.readyUntil === null || Date.parse(hold.readyUntil) > Date.parse(hold.placedAt),
    {
      message: "readyUntil must be after placedAt",
      path: ["readyUntil"],
    },
  );
export type Hold = z.infer<typeof HoldSchema>;

export const LibraryFineStatusSchema = z.enum(["open", "invoiced", "paid", "waived"]);
export type LibraryFineStatus = z.infer<typeof LibraryFineStatusSchema>;

export const LibraryFineSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    loanId: IdSchema,
    borrowerProfileId: IdSchema,
    reason: z.enum(["overdue", "lost", "damage"]),
    amount: MinorUnitsSchema.min(1),
    currency: CurrencyCodeSchema,
    status: LibraryFineStatusSchema,
    /** M18 fee invoice; set exactly when invoiced or paid. */
    feeInvoiceId: IdSchema.nullable(),
    waivedByStaffProfileId: IdSchema.nullable(),
    waiveReason: z.string().trim().min(1).max(300).nullable(),
  })
  .refine(
    (fine) =>
      (fine.status === "invoiced" || fine.status === "paid") === (fine.feeInvoiceId !== null),
    {
      message: "feeInvoiceId is set exactly when the fine is invoiced or paid",
      path: ["feeInvoiceId"],
    },
  )
  .refine(
    (fine) =>
      (fine.status === "waived") === (fine.waivedByStaffProfileId !== null) &&
      (fine.status === "waived") === (fine.waiveReason !== null),
    {
      message: "a person and a reason are recorded exactly when the fine is waived",
      path: ["waiveReason"],
    },
  );
export type LibraryFine = z.infer<typeof LibraryFineSchema>;

/** An AI reading suggestion with its reason (A-5). */
export const ReadingRecommendationSchema = z.strictObject({
  tenantId: IdSchema,
  borrowerProfileId: IdSchema,
  recordId: IdSchema,
  reason: z.string().trim().min(1).max(300),
  aiGenerated: z.literal(true),
  tier: CapabilityTierSchema,
  createdAt: UtcDateTimeSchema,
});
export type ReadingRecommendation = z.infer<typeof ReadingRecommendationSchema>;
