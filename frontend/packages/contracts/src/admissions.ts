import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import {
  EmailSchema,
  IdSchema,
  IsoDateSchema,
  NameSchema,
  PhoneE164Schema,
  UtcDateTimeSchema,
} from "./common";
import { CustomFieldValuesSchema } from "./forms";

const validTimestampOrder = ({ createdAt, updatedAt }: { createdAt: string; updatedAt: string }) =>
  Date.parse(updatedAt) >= Date.parse(createdAt);
const timestampOrderIssue = {
  message: "updatedAt is before createdAt",
  path: ["updatedAt"],
};

function hasUniqueIds(ids: string[]) {
  return new Set(ids).size === ids.length;
}

export const EnquirySourceSchema = z.enum([
  "walk_in",
  "phone",
  "website",
  "public_form",
  "referral",
  "campaign",
  "event",
  "other",
]);
export type EnquirySource = z.infer<typeof EnquirySourceSchema>;

export const EnquiryStatusSchema = z.enum(["new", "contacted", "visit_booked", "applied", "lost"]);
export type EnquiryStatus = z.infer<typeof EnquiryStatusSchema>;

const enquiryInputFields = {
  source: EnquirySourceSchema,
  campusId: IdSchema.nullable(),
  contactName: NameSchema,
  contactPhone: PhoneE164Schema.nullable(),
  contactEmail: EmailSchema.nullable(),
  learnerName: NameSchema,
  programId: IdSchema.nullable(),
  followUpOn: IsoDateSchema.nullable(),
};

function hasContactMethod(enquiry: { contactPhone: string | null; contactEmail: string | null }) {
  return enquiry.contactPhone !== null || enquiry.contactEmail !== null;
}

const contactMethodIssue = {
  message: "A contact phone or email is required",
  path: ["contactPhone"],
};

export const EnquiryInputSchema = z
  .strictObject(enquiryInputFields)
  .refine(hasContactMethod, contactMethodIssue);
export type EnquiryInput = z.infer<typeof EnquiryInputSchema>;

/** Contact details are personal data (V-7). Lead scores are advisory and a person decides. */
export const EnquirySchema = z
  .strictObject({
    ...enquiryInputFields,
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    campaignCode: AcademicCodeSchema.nullable(),
    status: EnquiryStatusSchema,
    lostReason: z.string().trim().min(1).max(300).nullable(),
    assignedStaffProfileId: IdSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine(hasContactMethod, contactMethodIssue)
  .refine((enquiry) => (enquiry.lostReason !== null) === (enquiry.status === "lost"), {
    message: "lostReason is set exactly when the enquiry is lost",
    path: ["lostReason"],
  })
  .refine(validTimestampOrder, timestampOrderIssue);
export type Enquiry = z.infer<typeof EnquirySchema>;

export const ApplicationStatusSchema = z.enum([
  "draft",
  "submitted",
  "under_review",
  "test_scheduled",
  "offered",
  "waitlisted",
  "accepted",
  "rejected",
  "withdrawn",
  "enrolled",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

const DECIDED_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "offered",
  "waitlisted",
  "rejected",
  "accepted",
  "enrolled",
]);

export const ApplicationSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    enquiryId: IdSchema.nullable(),
    /** Issued using the institution's application numbering format. */
    applicationNumber: z.string().trim().min(1).max(40),
    /** FormDefinition id. */
    formId: IdSchema,
    academicYearId: IdSchema,
    programId: IdSchema,
    yearLevelId: IdSchema.nullable(),
    applicantPersonId: IdSchema,
    guardianPersonIds: z.array(IdSchema).max(4).refine(hasUniqueIds, {
      message: "Guardian person ids must be unique",
    }),
    answers: CustomFieldValuesSchema,
    documentIds: z.array(IdSchema).max(30).refine(hasUniqueIds, {
      message: "Document ids must be unique",
    }),
    status: ApplicationStatusSchema,
    submittedAt: UtcDateTimeSchema.nullable(),
    decidedAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine(({ submittedAt, status }) => (submittedAt === null) === (status === "draft"), {
    message: "submittedAt is required for every status except draft",
    path: ["submittedAt"],
  })
  .refine(
    (application) => (application.decidedAt !== null) === DECIDED_STATUSES.has(application.status),
    {
      message: "decidedAt is set exactly when offered, waitlisted, rejected, accepted or enrolled",
      path: ["decidedAt"],
    },
  )
  .refine(validTimestampOrder, timestampOrderIssue);
export type Application = z.infer<typeof ApplicationSchema>;

export const AdmissionOfferStatusSchema = z.enum([
  "open",
  "accepted",
  "declined",
  "expired",
  "revoked",
]);
export type AdmissionOfferStatus = z.infer<typeof AdmissionOfferStatusSchema>;

export const AdmissionOfferSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    applicationId: IdSchema,
    classGroupId: IdSchema.nullable(),
    expiresOn: IsoDateSchema,
    status: AdmissionOfferStatusSchema,
    respondedAt: UtcDateTimeSchema.nullable(),
    createdAt: UtcDateTimeSchema,
  })
  .refine(
    ({ respondedAt, status }) =>
      (respondedAt !== null) === (status === "accepted" || status === "declined"),
    {
      message: "respondedAt is set exactly when the offer is accepted or declined",
      path: ["respondedAt"],
    },
  );
export type AdmissionOffer = z.infer<typeof AdmissionOfferSchema>;

export const WaitlistEntrySchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  applicationId: IdSchema,
  programId: IdSchema,
  position: z.int().min(1),
  addedAt: UtcDateTimeSchema,
});
export type WaitlistEntry = z.infer<typeof WaitlistEntrySchema>;
