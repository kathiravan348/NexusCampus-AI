import { describe, expect, it } from "vitest";
import {
  EnquiryFormSummarySchema,
  PublicEnquiryFormSchema,
  PublicEnquiryInputSchema,
  PublicEnquiryReceiptSchema,
  type EnquiryFormSummary,
  type PublicEnquiryForm,
  type PublicEnquiryInput,
  type PublicEnquiryReceipt,
} from "./public-enquiry";

const form: PublicEnquiryForm = {
  id: "pef-3p9w6c2r5t4h",
  institutionName: "Riverside School",
  programs: [{ id: "prg-riverside", name: "Years 5 to 10" }],
  campuses: [
    { id: "cmp-rv-north", name: "Riverside School North" },
    { id: "cmp-rv-south", name: "Riverside School South" },
  ],
};

const input: PublicEnquiryInput = {
  learnerName: "Maya Example",
  contactName: "Priya Example",
  contactPhone: "+447700900123",
  contactEmail: null,
  programId: "prg-riverside",
  campusId: "cmp-rv-north",
  consent: true,
  website: "",
};

const receipt: PublicEnquiryReceipt = { received: true };

const summary: EnquiryFormSummary = {
  id: "pef-3p9w6c2r5t4h",
  tenantId: "ten-rv",
  institutionId: "ins-rv",
  institutionName: "Riverside School",
};

describe("PublicEnquiryFormSchema", () => {
  it("accepts institution, program and campus names only and rejects extra fields", () => {
    expect(PublicEnquiryFormSchema.parse(form)).toEqual(form);
    expect(PublicEnquiryFormSchema.parse({ ...form, programs: [], campuses: [] })).toEqual({
      ...form,
      programs: [],
      campuses: [],
    });
    expect(PublicEnquiryFormSchema.safeParse({ ...form, tenantId: "ten-rv" }).success).toBe(false);
    expect(PublicEnquiryFormSchema.safeParse({ ...form, institutionId: "ins-rv" }).success).toBe(
      false,
    );
  });
});

describe("PublicEnquiryInputSchema", () => {
  it("accepts phone-only, email-only and null optional program/campus", () => {
    expect(PublicEnquiryInputSchema.parse(input)).toEqual(input);
    const emailOnly: PublicEnquiryInput = {
      ...input,
      contactPhone: null,
      contactEmail: "family@example.test",
      programId: null,
      campusId: null,
    };
    expect(PublicEnquiryInputSchema.parse(emailOnly)).toEqual(emailOnly);
  });

  it("rejects missing contact methods and reports the issue on contactPhone", () => {
    const result = PublicEnquiryInputSchema.safeParse({
      ...input,
      contactPhone: null,
      contactEmail: null,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(["contactPhone"]);
  });

  it.each([
    { consent: false },
    { website: "https://spam.example" },
    { website: " " },
    { learnerName: "   " },
    { contactName: "" },
    { contactPhone: "07700900123" },
    { contactEmail: "not-an-email" },
    { source: "public_form" },
    { status: "new" },
  ])("rejects invalid public enquiry input %j", (fields) => {
    expect(PublicEnquiryInputSchema.safeParse({ ...input, ...fields }).success).toBe(false);
  });
});

describe("PublicEnquiryReceiptSchema", () => {
  it("accepts only { received: true } and never echoed fields", () => {
    expect(PublicEnquiryReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(PublicEnquiryReceiptSchema.safeParse({ received: false }).success).toBe(false);
    expect(PublicEnquiryReceiptSchema.safeParse({ received: true, id: "enq-1" }).success).toBe(
      false,
    );
  });
});

describe("EnquiryFormSummarySchema", () => {
  it("accepts a staff form reference and rejects extra fields", () => {
    expect(EnquiryFormSummarySchema.parse(summary)).toEqual(summary);
    expect(EnquiryFormSummarySchema.safeParse({ ...summary, secret: "x" }).success).toBe(false);
  });
});
