import { z } from "zod";
import { IdSchema, InstitutionTypeSchema, RegionSchema, UtcDateTimeSchema } from "../common";
import { DeliveryModelSchema } from "./account";
import { ControlCodeSchema, StepStatusSchema, jobStatusMatchesSteps } from "./shared";

/** Ask for a new tenant in a SaaS cell (P04). Self-hosted customers get a licence instead (P05). */
export const ProvisioningRequestSchema = z.strictObject({
  accountId: IdSchema,
  region: RegionSchema,
  institutionType: InstitutionTypeSchema,
  planCode: ControlCodeSchema,
  /** 1–60 days; null = paid from day one. */
  trialDays: z.int().min(1).max(60).nullable(),
  deliveryModel: z.enum([
    DeliveryModelSchema.enum.saas_shared,
    DeliveryModelSchema.enum.saas_dedicated,
  ]),
});
export type ProvisioningRequest = z.infer<typeof ProvisioningRequestSchema>;

export const ProvisioningStepNameSchema = z.enum([
  "create_tenant",
  "create_keys",
  "apply_profile",
  "seed",
  "invite_owner",
]);
export type ProvisioningStepName = z.infer<typeof ProvisioningStepNameSchema>;

export const OffboardingStepNameSchema = z.enum([
  "freeze_writes",
  "export_ready",
  "export_downloaded",
  "keys_destroyed",
  "certificate_issued",
]);
export type OffboardingStepName = z.infer<typeof OffboardingStepNameSchema>;

const stepsInOrder =
  <T extends string>(order: readonly T[]) =>
  (job: { readonly steps: readonly { readonly name: T }[] }) =>
    job.steps.length === order.length && job.steps.every((s, i) => s.name === order[i]);

/** Creating a tenant: its row in the region cell, its keys in the vault, its type profile, seed, owner invite. */
export const ProvisioningJobSchema = z
  .strictObject({
    id: IdSchema,
    request: ProvisioningRequestSchema,
    steps: z.array(z.strictObject({ name: ProvisioningStepNameSchema, status: StepStatusSchema })),
    status: StepStatusSchema,
    /** Known once `create_tenant` is done. */
    tenantId: IdSchema.nullable(),
    requestedByStaffId: IdSchema,
    createdAt: UtcDateTimeSchema,
  })
  .refine(stepsInOrder(ProvisioningStepNameSchema.options), {
    message: "steps must list every provisioning step once, in order",
    path: ["steps"],
  })
  .refine(jobStatusMatchesSteps, { message: "status does not match the steps", path: ["status"] })
  .refine((j) => (j.steps[0]?.status === "done") === (j.tenantId !== null), {
    message: "tenantId is set iff create_tenant is done",
    path: ["tenantId"],
  });
export type ProvisioningJob = z.infer<typeof ProvisioningJobSchema>;

/**
 * Leaving: freeze, hand the institution its export, destroy its keys (crypto-shred, V-2) and issue a certificate.
 * `shredCertificateId` is set iff the certificate step is done.
 */
export const OffboardingJobSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    tenantId: IdSchema,
    steps: z.array(z.strictObject({ name: OffboardingStepNameSchema, status: StepStatusSchema })),
    status: StepStatusSchema,
    shredCertificateId: IdSchema.nullable(),
    requestedByStaffId: IdSchema,
    createdAt: UtcDateTimeSchema,
  })
  .refine(stepsInOrder(OffboardingStepNameSchema.options), {
    message: "steps must list every offboarding step once, in order",
    path: ["steps"],
  })
  .refine(jobStatusMatchesSteps, { message: "status does not match the steps", path: ["status"] })
  .refine((j) => (j.steps.at(-1)?.status === "done") === (j.shredCertificateId !== null), {
    message: "shredCertificateId is set iff the certificate is issued",
    path: ["shredCertificateId"],
  });
export type OffboardingJob = z.infer<typeof OffboardingJobSchema>;
