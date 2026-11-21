import { z } from "zod";
import { IdSchema, RegionSchema, UtcDateTimeSchema } from "../common";
import { StepStatusSchema, jobStatusMatchesSteps } from "./shared";

export const PortabilityDirectionSchema = z.enum([
  "saas_to_self_hosted",
  "self_hosted_to_saas",
  "region_move",
]);
export type PortabilityDirection = z.infer<typeof PortabilityDirectionSchema>;

export const PortabilityStepNameSchema = z.enum([
  "preflight",
  "export_encrypted",
  "transfer",
  "import",
  "verify",
  "cutover",
  "shred_source",
]);
export type PortabilityStepName = z.infer<typeof PortabilityStepNameSchema>;

/**
 * Moving a tenant between delivery models or regions (P18, DM-8, G-5). The export is always encrypted with the
 * tenant's keys; we orchestrate it without reading it (V-4).
 */
export const PortabilityJobSchema = z
  .strictObject({
    id: IdSchema,
    accountId: IdSchema,
    tenantId: IdSchema,
    direction: PortabilityDirectionSchema,
    fromRegion: RegionSchema,
    toRegion: RegionSchema,
    steps: z.array(z.strictObject({ name: PortabilityStepNameSchema, status: StepStatusSchema })),
    status: StepStatusSchema,
    encrypted: z.literal(true),
    createdAt: UtcDateTimeSchema,
  })
  .refine(
    (j) =>
      j.steps.length === PortabilityStepNameSchema.options.length &&
      j.steps.every((s, i) => s.name === PortabilityStepNameSchema.options[i]),
    { message: "steps must list every portability step once, in order", path: ["steps"] },
  )
  .refine(jobStatusMatchesSteps, { message: "status does not match the steps", path: ["status"] })
  .refine((j) => j.direction !== "region_move" || j.fromRegion !== j.toRegion, {
    message: "a region move needs two different regions",
    path: ["toRegion"],
  });
export type PortabilityJob = z.infer<typeof PortabilityJobSchema>;

/** Proof that a tenant's keys were destroyed (crypto-shred, V-2): signed by our Ed25519 key, verifiable by anyone. */
export const ShredCertificateSchema = z.strictObject({
  id: IdSchema,
  tenantId: IdSchema,
  keyIds: z.array(IdSchema).min(1),
  destroyedAt: UtcDateTimeSchema,
  signingKeyId: z.string().min(1).max(64),
  signature: z
    .base64()
    .refine((s) => s.length === 88, { message: "Ed25519 signature is 64 bytes" }),
});
export type ShredCertificate = z.infer<typeof ShredCertificateSchema>;
