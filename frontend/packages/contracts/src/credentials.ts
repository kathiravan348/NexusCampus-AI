import { z } from "zod";
import { AcademicCodeSchema } from "./academics";
import { IdSchema, IsoDateSchema, NameSchema, UtcDateTimeSchema } from "./common";

/**
 * M45 credentials and badges (NEX-253, D87): certificates, badges, diplomas and micro-credentials issued as Open Badges 3
 * or W3C verifiable credentials, or as PDF only.
 *
 * Rules the server enforces (D46, V-7, G-6): signing keys live in OpenBao per institution and never appear in a
 * contract, log or export — a proof only references the public key; revocation flips the status-list bit at once; the
 * public verification answers the same shape for unknown and malformed codes (no enumeration), is rate limited and
 * shows no learner data; a learner may share or hide each credential.
 */

const isNotBefore = (later: string, earlier: string) => Date.parse(later) >= Date.parse(earlier);
const DidOrHttpsSchema = z
  .string()
  .max(500)
  .regex(/^(did:web:[A-Za-z0-9.%:-]+(#[A-Za-z0-9._-]+)?|https:\/\/[^\s]+)$/);

export const CredentialKindSchema = z.enum(["certificate", "badge", "diploma", "micro_credential"]);
export type CredentialKind = z.infer<typeof CredentialKindSchema>;

export const CredentialFormatSchema = z.enum(["open_badges_3", "w3c_vc", "pdf_only"]);
export type CredentialFormat = z.infer<typeof CredentialFormatSchema>;

export const CredentialTemplateSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    institutionId: IdSchema,
    code: AcademicCodeSchema,
    kind: CredentialKindSchema,
    name: NameSchema,
    description: z.string().trim().max(2000),
    /** Open Badges achievement criteria. */
    criteria: z.string().trim().min(1).max(4000),
    outcomeIds: z
      .array(IdSchema)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, { message: "ids must be unique" }),
    imageAssetId: IdSchema.nullable(),
    format: CredentialFormatSchema,
    validityMonths: z.int().min(1).max(600).nullable(),
    status: z.enum(["draft", "active", "retired"]),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema,
  })
  .refine((template) => isNotBefore(template.updatedAt, template.createdAt), {
    message: "updatedAt is before createdAt",
    path: ["updatedAt"],
  });
export type CredentialTemplate = z.infer<typeof CredentialTemplateSchema>;

/** A reference to the institution's public key — never key material. */
export const CredentialProofSchema = z.strictObject({
  type: z.enum(["DataIntegrityProof", "Ed25519Signature2020"]),
  verificationMethod: DidOrHttpsSchema,
  created: UtcDateTimeSchema,
});
export type CredentialProof = z.infer<typeof CredentialProofSchema>;

export const IssuedCredentialStatusSchema = z.enum(["issued", "revoked", "expired"]);
export type IssuedCredentialStatus = z.infer<typeof IssuedCredentialStatusSchema>;

export const IssuedCredentialSchema = z
  .strictObject({
    id: IdSchema,
    tenantId: IdSchema,
    templateId: IdSchema,
    learnerId: IdSchema,
    format: CredentialFormatSchema,
    /** Verifiable credential id. */
    credentialUri: z
      .string()
      .regex(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
    issuerId: DidOrHttpsSchema,
    /** Salted hash of the recipient's identifier (Open Badges `IdentityObject`); never an email. */
    recipientIdentityHash: z.string().regex(/^sha256\$[0-9a-f]{64}$/),
    issuedAt: UtcDateTimeSchema,
    expiresAt: UtcDateTimeSchema.nullable(),
    status: IssuedCredentialStatusSchema,
    revokedAt: UtcDateTimeSchema.nullable(),
    revokedReason: z.string().trim().min(1).max(300).nullable(),
    verificationCode: z.string().regex(/^[A-Z0-9]{8,16}$/),
    /** Position in the published status list; set exactly for verifiable formats. */
    statusListIndex: z.int().min(0).nullable(),
    /** Set exactly for verifiable formats. */
    proof: CredentialProofSchema.nullable(),
    /** M91 portfolio entries offered as evidence. */
    evidenceEntryIds: z
      .array(IdSchema)
      .max(10)
      .refine((ids) => new Set(ids).size === ids.length, { message: "ids must be unique" }),
    issuedByStaffProfileId: IdSchema,
  })
  .refine(
    (credential) =>
      credential.expiresAt === null ||
      Date.parse(credential.expiresAt) > Date.parse(credential.issuedAt),
    {
      message: "expiresAt must be after issuedAt",
      path: ["expiresAt"],
    },
  )
  .refine(
    (credential) =>
      (credential.status === "revoked") === (credential.revokedAt !== null) &&
      (credential.status === "revoked") === (credential.revokedReason !== null),
    {
      message: "revokedAt and revokedReason are set exactly when revoked",
      path: ["revokedReason"],
    },
  )
  .refine(
    (credential) =>
      credential.revokedAt === null || isNotBefore(credential.revokedAt, credential.issuedAt),
    {
      message: "revokedAt is before issuedAt",
      path: ["revokedAt"],
    },
  )
  .refine(
    (credential) =>
      (credential.format !== "pdf_only") === (credential.proof !== null) &&
      (credential.format !== "pdf_only") === (credential.statusListIndex !== null),
    {
      message: "proof and statusListIndex are set exactly for verifiable formats",
      path: ["proof"],
    },
  )
  .refine((credential) => credential.status !== "expired" || credential.expiresAt !== null, {
    message: "an expired credential has an expiry date",
    path: ["expiresAt"],
  });
export type IssuedCredential = z.infer<typeof IssuedCredentialSchema>;

export const VerificationResultSchema = z.enum(["valid", "revoked", "expired", "not_found"]);
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

/** The public verification answer: no learner name, id or hash (V-7). */
export const CredentialVerificationSchema = z
  .strictObject({
    verificationCode: z.string().min(1).max(64),
    result: VerificationResultSchema,
    kind: CredentialKindSchema.nullable(),
    credentialName: NameSchema.nullable(),
    institutionName: NameSchema.nullable(),
    issuedOn: IsoDateSchema.nullable(),
    expiresOn: IsoDateSchema.nullable(),
  })
  .refine(
    (verification) => {
      const found = verification.result !== "not_found";
      return (
        found === (verification.kind !== null) &&
        found === (verification.credentialName !== null) &&
        found === (verification.institutionName !== null) &&
        found === (verification.issuedOn !== null) &&
        (found || verification.expiresOn === null) &&
        (verification.result !== "expired" || verification.expiresOn !== null)
      );
    },
    { message: "details are shown exactly when the credential is found", path: ["result"] },
  );
export type CredentialVerification = z.infer<typeof CredentialVerificationSchema>;
