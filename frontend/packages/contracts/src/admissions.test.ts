import { describe, expect, it } from "vitest";
import {
  AdmissionOfferSchema,
  ApplicationSchema,
  EnquirySchema,
  WaitlistEntrySchema,
  type AdmissionOffer,
  type Application,
  type Enquiry,
  type WaitlistEntry,
} from "./admissions";

const createdAt = "2026-11-20T09:00:00Z";
const updatedAt = "2026-11-21T09:00:00Z";

const enquiry: Enquiry = {
  id: "enquiry-01",
  tenantId: "tenant-demo",
  institutionId: "institution-school",
  campusId: null,
  source: "walk_in",
  campaignCode: null,
  contactName: "Asha Example",
  contactPhone: "+12025550123",
  contactEmail: null,
  learnerName: "Devi Example",
  programId: "program-k12",
  status: "new",
  lostReason: null,
  assignedStaffProfileId: null,
  followUpOn: "2026-11-25",
  createdAt,
  updatedAt,
};

const application: Application = {
  id: "application-01",
  tenantId: enquiry.tenantId,
  institutionId: enquiry.institutionId,
  enquiryId: enquiry.id,
  applicationNumber: "APP/2026/0001",
  formId: "form-k12-application",
  academicYearId: "year-2027",
  programId: "program-k12",
  yearLevelId: "grade-06",
  applicantPersonId: "person-learner",
  guardianPersonIds: ["person-guardian-01", "person-guardian-02"],
  answers: { transportNeeded: true },
  documentIds: ["document-01"],
  status: "submitted",
  submittedAt: updatedAt,
  decidedAt: null,
  createdAt,
  updatedAt,
};

const offer: AdmissionOffer = {
  id: "offer-01",
  tenantId: application.tenantId,
  applicationId: application.id,
  classGroupId: "section-06a",
  expiresOn: "2026-12-01",
  status: "open",
  respondedAt: null,
  createdAt: updatedAt,
};

const waitlistEntry: WaitlistEntry = {
  id: "waitlist-01",
  tenantId: application.tenantId,
  applicationId: application.id,
  programId: application.programId,
  position: 1,
  addedAt: updatedAt,
};

describe("EnquirySchema", () => {
  it("accepts a phone-only walk-in and an email-only lost enquiry with a reason", () => {
    expect(EnquirySchema.parse(enquiry)).toEqual(enquiry);
    const lostEnquiry = {
      ...enquiry,
      contactPhone: null,
      contactEmail: "contact@example.test",
      status: "lost",
      lostReason: "Family chose another school",
    } satisfies Enquiry;
    expect(EnquirySchema.parse(lostEnquiry)).toEqual(lostEnquiry);
  });

  it.each([
    { contactPhone: null },
    { lostReason: "Family chose another school" },
    { status: "lost" },
    { updatedAt: "2026-11-19T09:00:00Z" },
    { leadScore: 80 },
  ])("rejects invalid enquiry fields %j", (fields) => {
    expect(EnquirySchema.safeParse({ ...enquiry, ...fields }).success).toBe(false);
  });
});

describe("ApplicationSchema", () => {
  it("accepts a submitted K12 application with two guardians", () => {
    expect(ApplicationSchema.parse(application)).toEqual(application);
  });

  it("accepts an offered application and its open offer", () => {
    const offeredApplication = {
      ...application,
      status: "offered",
      decidedAt: updatedAt,
    } satisfies Application;
    expect(ApplicationSchema.parse(offeredApplication)).toEqual(offeredApplication);
    expect(AdmissionOfferSchema.parse(offer)).toEqual(offer);
  });

  it.each([
    { status: "draft" },
    { submittedAt: null },
    { status: "waitlisted" },
    { decidedAt: updatedAt },
    { guardianPersonIds: ["person-guardian-01", "person-guardian-01"] },
    { documentIds: ["document-01", "document-01"] },
    { updatedAt: "2026-11-19T09:00:00Z" },
    { admissionScore: 80 },
  ])("rejects invalid application fields %j", (fields) => {
    expect(ApplicationSchema.safeParse({ ...application, ...fields }).success).toBe(false);
  });
});

describe("AdmissionOfferSchema", () => {
  it("requires a response time exactly for accepted or declined offers", () => {
    const acceptedOffer = { ...offer, status: "accepted", respondedAt: updatedAt };
    expect(AdmissionOfferSchema.parse(acceptedOffer)).toEqual(acceptedOffer);
    expect(AdmissionOfferSchema.safeParse({ ...offer, status: "declined" }).success).toBe(false);
    const openWithResponse = { ...offer, respondedAt: updatedAt };
    expect(AdmissionOfferSchema.safeParse(openWithResponse).success).toBe(false);
    expect(AdmissionOfferSchema.safeParse({ ...offer, note: "Open" }).success).toBe(false);
  });
});

describe("WaitlistEntrySchema", () => {
  it("accepts a one-based position and rejects zero and extra fields", () => {
    expect(WaitlistEntrySchema.parse(waitlistEntry)).toEqual(waitlistEntry);
    expect(WaitlistEntrySchema.safeParse({ ...waitlistEntry, position: 0 }).success).toBe(false);
    expect(WaitlistEntrySchema.safeParse({ ...waitlistEntry, extra: true }).success).toBe(false);
  });
});
