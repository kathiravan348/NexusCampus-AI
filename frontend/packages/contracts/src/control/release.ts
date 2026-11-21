import { z } from "zod";
import { IdSchema, UtcDateTimeSchema } from "../common";
import { SemverSchema, StepStatusSchema, hasNoDuplicates } from "./shared";

/** Release channels (P07). One release train for every delivery model (DM-5). */
export const ReleaseChannelSchema = z.enum(["stable", "lts", "preview"]);
export type ReleaseChannel = z.infer<typeof ReleaseChannelSchema>;

export const ReleaseStatusSchema = z.enum(["draft", "published", "withdrawn"]);
export type ReleaseStatus = z.infer<typeof ReleaseStatusSchema>;

/**
 * A release: signed images and, for air-gapped sites, a signed offline bundle (DM-9). Database migrations are
 * forward-only; `minUpgradeFrom` is the oldest version that can upgrade straight to it.
 */
export const ReleaseSchema = z
  .strictObject({
    id: IdSchema,
    version: SemverSchema,
    channel: ReleaseChannelSchema,
    status: ReleaseStatusSchema,
    publishedAt: UtcDateTimeSchema.nullable(),
    signed: z.boolean(),
    offlineBundle: z.boolean(),
    minUpgradeFrom: SemverSchema,
    migrationNotes: z.string().max(5000),
    /** Release-note draft written by AI; a release manager edits and approves it. */
    notesAiDrafted: z.boolean(),
  })
  .refine((r) => (r.status === "draft") === (r.publishedAt === null), {
    message: "publishedAt is set iff the release is not a draft",
    path: ["publishedAt"],
  })
  .refine((r) => r.status === "draft" || r.signed, {
    message: "only signed releases can be published",
    path: ["signed"],
  })
  .refine((r) => r.channel !== "preview" || !r.offlineBundle, {
    message: "preview releases have no offline bundle",
    path: ["offlineBundle"],
  });
export type Release = z.infer<typeof ReleaseSchema>;

/** Staged rollout of a release: ring 0 (our own cells) → ring 3 (everyone on the channel). */
export const RolloutSchema = z
  .strictObject({
    id: IdSchema,
    releaseId: IdSchema,
    ring: z.int().min(0).max(3),
    deploymentIds: z.array(IdSchema).min(1),
    status: z.union([StepStatusSchema, z.literal("rolled_back")]),
    startedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((r) => hasNoDuplicates(r.deploymentIds), {
    message: "deploymentIds has duplicates",
    path: ["deploymentIds"],
  })
  .refine((r) => (r.status === "pending") === (r.startedAt === null), {
    message: "startedAt is set iff the rollout has started",
    path: ["startedAt"],
  });
export type Rollout = z.infer<typeof RolloutSchema>;
