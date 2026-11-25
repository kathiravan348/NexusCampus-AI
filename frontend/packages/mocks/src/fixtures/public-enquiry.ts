import { INSTITUTION, TENANT } from "./ids";

/** Stable opaque public enquiry form ids — no tenant name or slug in the URL (D16, D79). */
export const PUBLIC_ENQUIRY_FORM = {
  littleSteps: "pef-7k4m2x9q1n8v",
  riversideSchool: "pef-3p9w6c2r5t4h",
  northbridge: "pef-8b5d1f7j3z6m",
  apex: "pef-4n2y8s6v9k1x",
  harmony: "pef-6h3t9q5w2r8c",
} as const;

export interface PublicEnquiryFormRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly institutionId: string;
}

/** One public enquiry form per demo institution (D79). */
export const PUBLIC_ENQUIRY_FORMS: readonly PublicEnquiryFormRecord[] = [
  {
    id: PUBLIC_ENQUIRY_FORM.littleSteps,
    tenantId: TENANT.littleSteps,
    institutionId: INSTITUTION.littleSteps,
  },
  {
    id: PUBLIC_ENQUIRY_FORM.riversideSchool,
    tenantId: TENANT.riverside,
    institutionId: INSTITUTION.riversideSchool,
  },
  {
    id: PUBLIC_ENQUIRY_FORM.northbridge,
    tenantId: TENANT.northbridge,
    institutionId: INSTITUTION.northbridge,
  },
  {
    id: PUBLIC_ENQUIRY_FORM.apex,
    tenantId: TENANT.apex,
    institutionId: INSTITUTION.apex,
  },
  {
    id: PUBLIC_ENQUIRY_FORM.harmony,
    tenantId: TENANT.harmony,
    institutionId: INSTITUTION.harmony,
  },
];
