import { z } from "zod";
import { EmailSchema, IdSchema, NameSchema, PhoneE164Schema } from "./common";

/** Name-only option shown on the public enquiry form (D79, V-7). */
export const PublicEnquiryOptionSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
});
export type PublicEnquiryOption = z.infer<typeof PublicEnquiryOptionSchema>;

/** Public form metadata for `/apply/:formId` — institution, program and campus names only (D79). */
export const PublicEnquiryFormSchema = z.strictObject({
  id: IdSchema,
  institutionName: NameSchema,
  programs: z.array(PublicEnquiryOptionSchema),
  campuses: z.array(PublicEnquiryOptionSchema),
});
export type PublicEnquiryForm = z.infer<typeof PublicEnquiryFormSchema>;

function hasPublicContactMethod(input: {
  contactPhone: string | null;
  contactEmail: string | null;
}) {
  return input.contactPhone !== null || input.contactEmail !== null;
}

/** Public enquiry payload: requires consent, empty honeypot and at least one contact method (D79). */
export const PublicEnquiryInputSchema = z
  .strictObject({
    learnerName: NameSchema,
    contactName: NameSchema,
    contactPhone: PhoneE164Schema.nullable(),
    contactEmail: EmailSchema.nullable(),
    programId: IdSchema.nullable(),
    campusId: IdSchema.nullable(),
    consent: z.literal(true),
    website: z.literal(""),
  })
  .refine(hasPublicContactMethod, {
    message: "A contact phone or email is required",
    path: ["contactPhone"],
  });
export type PublicEnquiryInput = z.infer<typeof PublicEnquiryInputSchema>;

/** Uniform acknowledgement returned whether stored or silently dropped by the honeypot (D79). */
export const PublicEnquiryReceiptSchema = z.strictObject({
  received: z.literal(true),
});
export type PublicEnquiryReceipt = z.infer<typeof PublicEnquiryReceiptSchema>;

/** Staff-facing reference to one institution's public enquiry form (`GET /api/v1/enquiry-forms`). */
export const EnquiryFormSummarySchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  institutionId: IdSchema,
  institutionName: NameSchema,
});
export type EnquiryFormSummary = z.infer<typeof EnquiryFormSummarySchema>;
