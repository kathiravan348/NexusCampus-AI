import { z } from "zod";
import { IdSchema, IsoDateSchema, ModuleIdSchema, UtcDateTimeSchema } from "../common";
import { hasNoDuplicates, notBefore } from "./shared";

/** Self-hosted editions (D52). */
export const LicenceEditionSchema = z.enum(["standard", "enterprise"]);
export type LicenceEdition = z.infer<typeof LicenceEditionSchema>;

/** Expiry → grace → read-only; never data loss (D23). */
export const LicenceStateSchema = z.enum(["active", "grace", "read_only", "expired", "revoked"]);
export type LicenceState = z.infer<typeof LicenceStateSchema>;

const LicenceTermsShape = {
  id: IdSchema,
  accountId: IdSchema,
  edition: LicenceEditionSchema,
  modules: z.array(ModuleIdSchema).min(1),
  learnerCap: z.int().min(1),
  campusCap: z.int().min(1),
  issuedAt: UtcDateTimeSchema,
  /** Null = perpetual (support and updates still end at `supportEndsAt`). */
  expiresAt: IsoDateSchema.nullable(),
  supportEndsAt: IsoDateSchema,
  graceDays: z.int().min(0).max(90),
  activation: z.enum(["online", "offline"]),
  /** Id of the Ed25519 signing key; the install agent (M84) holds the matching public key. */
  signingKeyId: z.string().min(1).max(64),
};

const termsAreValid = <
  T extends {
    readonly modules: readonly string[];
    readonly issuedAt: string;
    readonly expiresAt: string | null;
  },
>(
  l: T,
) =>
  hasNoDuplicates(l.modules) &&
  (l.expiresAt === null || notBefore(l.issuedAt.slice(0, 10), l.expiresAt));

/** A licence we issued (P05). */
export const LicenceSchema = z
  .strictObject({
    ...LicenceTermsShape,
    state: LicenceStateSchema,
    /** SHA-256 hex of the signed licence file. */
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    deploymentId: IdSchema.nullable(),
  })
  .refine(termsAreValid, {
    message: "modules must be unique and expiry on or after issue",
    path: ["expiresAt"],
  })
  .refine((l) => l.expiresAt !== null || (l.state !== "grace" && l.state !== "expired"), {
    message: "a perpetual licence cannot expire",
    path: ["state"],
  });
export type Licence = z.infer<typeof LicenceSchema>;

/**
 * The file a self-hosted install loads: the signed terms + an Ed25519 signature (base64, 64 bytes). M84 verifies it
 * offline (D23). Signing happens in the control backend, never in the browser.
 */
export const LicenceFileSchema = z.strictObject({
  format: z.literal("nexus-licence/1"),
  payload: z.strictObject(LicenceTermsShape).refine(termsAreValid, {
    message: "modules must be unique and expiry on or after issue",
    path: ["expiresAt"],
  }),
  signature: z
    .base64()
    .refine((s) => s.length === 88, { message: "Ed25519 signature is 64 bytes" }),
});
export type LicenceFile = z.infer<typeof LicenceFileSchema>;
