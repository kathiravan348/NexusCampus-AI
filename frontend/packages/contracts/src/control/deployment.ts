import { z } from "zod";
import { IdSchema, NameSchema, RegionSchema, UtcDateTimeSchema } from "../common";
import { ReleaseChannelSchema } from "./release";
import { SemverSchema, hasNoDuplicates } from "./shared";

export const DeploymentKindSchema = z.enum([
  "saas_shared_cell",
  "saas_dedicated_cell",
  "self_hosted",
  "edge",
]);
export type DeploymentKind = z.infer<typeof DeploymentKindSchema>;

export const DeploymentHealthSchema = z.enum(["healthy", "degraded", "down", "unknown"]);
export type DeploymentHealth = z.infer<typeof DeploymentHealthSchema>;

/**
 * One running copy of NexusCampus (P06): a SaaS cell, a dedicated cell, a customer's own install or an Edge node.
 * Self-hosted installs report through outbound, PII-free check-ins only (V-6); with telemetry off we only see
 * licence and update checks, so health is `unknown`.
 */
export const DeploymentSchema = z
  .strictObject({
    id: IdSchema,
    name: NameSchema,
    kind: DeploymentKindSchema,
    /** Null for the shared cells, which serve many accounts. */
    accountId: IdSchema.nullable(),
    region: RegionSchema,
    version: SemverSchema,
    channel: ReleaseChannelSchema,
    health: DeploymentHealthSchema,
    lastCheckInAt: UtcDateTimeSchema.nullable(),
    telemetryEnabled: z.boolean(),
    airGapped: z.boolean(),
    extensionIds: z.array(IdSchema),
    tenantCount: z.int().min(0),
  })
  .refine((d) => (d.kind === "saas_shared_cell") === (d.accountId === null), {
    message: "only a shared cell has no account",
    path: ["accountId"],
  })
  .refine((d) => d.telemetryEnabled || d.health === "unknown", {
    message: "without telemetry the health is unknown",
    path: ["health"],
  })
  .refine(
    (d) => !d.airGapped || (d.kind !== "saas_shared_cell" && d.kind !== "saas_dedicated_cell"),
    {
      message: "only customer installs can be air-gapped",
      path: ["airGapped"],
    },
  )
  .refine((d) => !d.airGapped || (!d.telemetryEnabled && d.lastCheckInAt === null), {
    message: "an air-gapped install never checks in",
    path: ["lastCheckInAt"],
  })
  .refine((d) => hasNoDuplicates(d.extensionIds), {
    message: "extensionIds has duplicates",
    path: ["extensionIds"],
  });
export type Deployment = z.infer<typeof DeploymentSchema>;

/** One PII-free health check-in: counts, rates and timings only (V-4). */
export const HealthSignalSchema = z.strictObject({
  deploymentId: IdSchema,
  at: UtcDateTimeSchema,
  version: SemverSchema,
  uptimePct: z.number().min(0).max(100),
  errorRatePct: z.number().min(0).max(100),
  p95LatencyMs: z.int().min(0),
  queueDepth: z.int().min(0),
  diskUsedPct: z.number().min(0).max(100),
  activeUsers: z.int().min(0),
});
export type HealthSignal = z.infer<typeof HealthSignalSchema>;
