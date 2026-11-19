import { z } from "zod";
import { IdSchema, ModuleIdSchema, NameSchema, UtcDateTimeSchema } from "./common";
import { AssetUrlSchema } from "./studio";

const notBefore = (from: string, to: string) => Date.parse(to) >= Date.parse(from);
const hasNoDuplicates = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Longest provider access an institution can approve (V-3). */
export const MAX_GRANT_HOURS = 72;
const HOUR_MS = 3_600_000;

export const KeyPurposeSchema = z.enum([
  "tenant_data",
  "field_health",
  "field_identity",
  "field_finance",
]);
export type KeyPurpose = z.infer<typeof KeyPurposeSchema>;

/** Who holds the key-encryption key: us (`platform`), the customer in our vault (`byok`), or only them (`hyok`). */
export const KeyCustodySchema = z.enum(["platform", "byok", "hyok"]);
export type KeyCustody = z.infer<typeof KeyCustodySchema>;

export const KeyStateSchema = z.enum(["active", "rotating", "revoked", "destroyed"]);
export type KeyState = z.infer<typeof KeyStateSchema>;

/** Status of one tenant key in the vault (M83, V-2). Metadata only — never key material. */
export const KeyStatusSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    purpose: KeyPurposeSchema,
    custody: KeyCustodySchema,
    status: KeyStateSchema,
    createdAt: UtcDateTimeSchema,
    rotatedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((k) => k.rotatedAt === null || notBefore(k.createdAt, k.rotatedAt), {
    message: "rotatedAt is before createdAt",
    path: ["rotatedAt"],
  });
export type KeyStatus = z.infer<typeof KeyStatusSchema>;

export const AccessModeSchema = z.enum(["read", "edit"]);
export type AccessMode = z.infer<typeof AccessModeSchema>;

export const AccessRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "revoked",
]);
export type AccessRequestStatus = z.infer<typeof AccessRequestStatusSchema>;

const ModuleListSchema = z
  .array(ModuleIdSchema)
  .min(1)
  .refine(hasNoDuplicates, { message: "modules has duplicates" });

/**
 * A provider support request the institution decides on in its own app (V-3, D22). `staffRef` is an opaque
 * Nexus Control staff reference — provider staff are not people in the tenant.
 */
export const AccessRequestSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    staffRef: IdSchema,
    staffDisplayName: NameSchema,
    reason: z.string().trim().min(1).max(2000),
    modules: ModuleListSchema,
    mode: AccessModeSchema,
    durationHours: z.int().min(1).max(MAX_GRANT_HOURS),
    status: AccessRequestStatusSchema,
    requestedAt: UtcDateTimeSchema,
    decidedAt: UtcDateTimeSchema.nullable(),
    /** The institution user who approved or denied. */
    decidedBy: IdSchema.nullable(),
  })
  .refine((r) => (r.decidedAt !== null) === (r.status !== "pending"), {
    message: "decidedAt is set exactly when the request is no longer pending",
    path: ["decidedAt"],
  })
  .refine((r) => (r.decidedBy !== null) === (r.status !== "pending"), {
    message: "decidedBy is set exactly when the request is no longer pending",
    path: ["decidedBy"],
  })
  .refine((r) => r.decidedAt === null || notBefore(r.requestedAt, r.decidedAt), {
    message: "decidedAt is before requestedAt",
    path: ["decidedAt"],
  });
export type AccessRequest = z.infer<typeof AccessRequestSchema>;

/** Time-boxed access created by an approval (V-3): ends at most 72 h after it starts; may be revoked early. */
export const AccessGrantSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    requestId: IdSchema,
    modules: ModuleListSchema,
    mode: AccessModeSchema,
    startsAt: UtcDateTimeSchema,
    endsAt: UtcDateTimeSchema,
    revokedAt: UtcDateTimeSchema.nullable(),
  })
  .refine((g) => Date.parse(g.endsAt) > Date.parse(g.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  })
  .refine((g) => Date.parse(g.endsAt) - Date.parse(g.startsAt) <= MAX_GRANT_HOURS * HOUR_MS, {
    message: "a grant lasts at most 72 hours",
    path: ["endsAt"],
  })
  .refine((g) => g.revokedAt === null || notBefore(g.startsAt, g.revokedAt), {
    message: "revokedAt is before startsAt",
    path: ["revokedAt"],
  });
export type AccessGrant = z.infer<typeof AccessGrantSchema>;

export const BreakGlassCategorySchema = z.enum(["legal_order", "security_incident"]);
export type BreakGlassCategory = z.infer<typeof BreakGlassCategorySchema>;

/** Emergency provider access (V-5): two distinct provider approvers; the institution is told at once. */
export const BreakGlassNoticeSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    category: BreakGlassCategorySchema,
    approverRefs: z.tuple([IdSchema, IdSchema]),
    occurredAt: UtcDateTimeSchema,
    notifiedAt: UtcDateTimeSchema,
    reportUrl: AssetUrlSchema.nullable(),
  })
  .refine((n) => n.approverRefs[0] !== n.approverRefs[1], {
    message: "the two approvers must be different people",
    path: ["approverRefs"],
  })
  .refine((n) => notBefore(n.occurredAt, n.notifiedAt), {
    message: "notifiedAt is before occurredAt",
    path: ["notifiedAt"],
  });
export type BreakGlassNotice = z.infer<typeof BreakGlassNoticeSchema>;
