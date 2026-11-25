import { z } from "zod";
import {
  EmailSchema,
  IdSchema,
  InstitutionTypeSchema,
  LocaleSchema,
  NameSchema,
  PhoneE164Schema,
} from "./common";

const hasNoDuplicates = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Name-only option shown on the public enquiry form (D79, V-7). */
export const PublicEnquiryOptionSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
});
export type PublicEnquiryOption = z.infer<typeof PublicEnquiryOptionSchema>;

/** Public form metadata for `/apply/:formId` — institution name, type, locales and options (D79). */
export const PublicEnquiryFormSchema = z
  .strictObject({
    id: IdSchema,
    institutionName: NameSchema,
    institutionType: InstitutionTypeSchema,
    defaultLocale: LocaleSchema,
    supportedLocales: z.array(LocaleSchema).min(1),
    programs: z.array(PublicEnquiryOptionSchema),
    campuses: z.array(PublicEnquiryOptionSchema),
  })
  .refine((f) => f.supportedLocales.includes(f.defaultLocale), {
    message: "supportedLocales must include defaultLocale",
    path: ["supportedLocales"],
  })
  .refine((f) => hasNoDuplicates(f.supportedLocales), {
    message: "supportedLocales has duplicates",
    path: ["supportedLocales"],
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
