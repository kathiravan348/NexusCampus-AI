import { z } from "zod";
import { IdSchema, ModuleIdSchema, NameSchema, UtcDateTimeSchema } from "./common";
import { MessageKeySchema } from "./studio";

const notBefore = (from: string, to: string) => Date.parse(to) >= Date.parse(from);
const Count = z.int().min(0);

export const DevicePlatformSchema = z.enum(["web", "android", "ios", "edge"]);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

/** `revoke_pending` = an admin asked for a remote wipe that the device has not run yet (M10, O-3). */
export const DeviceStatusSchema = z.enum(["active", "revoke_pending", "revoked"]);
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

/** A device in the M10 registry with its sync state. `lostWriteCount` = writes wiped by a remote revoke. */
export const DeviceSyncSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    userId: IdSchema,
    label: NameSchema,
    platform: DevicePlatformSchema,
    lastSyncAt: UtcDateTimeSchema.nullable(),
    pendingCount: Count,
    conflictCount: Count,
    lostWriteCount: Count,
    status: DeviceStatusSchema,
    revokedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((d) => (d.revokedAt !== null) === (d.status === "revoked"), {
    message: "revokedAt is set exactly when the device is revoked",
    path: ["revokedAt"],
  });
export type DeviceSync = z.infer<typeof DeviceSyncSchema>;

/** Same values as `MergeRule` in `@nexus/offline` (ARCHITECTURE §5). */
export const MergeRuleSchema = z.enum(["lww-audited", "append-only", "manual-review-only"]);
export type MergeRule = z.infer<typeof MergeRuleSchema>;

export const ConflictResolutionSchema = z.enum(["keep_server", "keep_client", "merged"]);
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;

/**
 * A write the server could not merge automatically. Carries no payload (privacy): `summaryKey` is a
 * message key describing it, e.g. `m17.conflict.markChanged`.
 */
export const SyncConflictSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    deviceId: IdSchema,
    moduleId: ModuleIdSchema,
    operation: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/, {
      message: "Must be a dotted camelCase operation, e.g. roll.mark",
    }),
    mergeRule: MergeRuleSchema,
    summaryKey: MessageKeySchema,
    clientVersion: z.int().min(0),
    serverVersion: z.int().min(0),
    status: z.enum(["open", "resolved"]),
    resolution: ConflictResolutionSchema.nullable(),
    createdAt: UtcDateTimeSchema,
    resolvedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((c) => (c.resolution !== null) === (c.status === "resolved"), {
    message: "resolution is set exactly when the conflict is resolved",
    path: ["resolution"],
  })
  .refine((c) => (c.resolvedAt !== null) === (c.status === "resolved"), {
    message: "resolvedAt is set exactly when the conflict is resolved",
    path: ["resolvedAt"],
  })
  .refine((c) => c.resolvedAt === null || notBefore(c.createdAt, c.resolvedAt), {
    message: "resolvedAt is before createdAt",
    path: ["resolvedAt"],
  });
export type SyncConflict = z.infer<typeof SyncConflictSchema>;
