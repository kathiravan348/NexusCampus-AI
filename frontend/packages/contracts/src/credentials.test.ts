import { describe, expect, it } from "vitest";
import {
  CredentialTemplateSchema,
  CredentialVerificationSchema,
  IssuedCredentialSchema,
  type CredentialTemplate,
  type CredentialVerification,
  type IssuedCredential,
} from "./index";

const badge: CredentialTemplate = {
  id: "template-python-badge",
  tenantId: "tenant-academy",
  institutionId: "institution-academy",
  code: "PY-BASICS-BADGE",
  kind: "badge",
  name: "Python basics",
  description: "Awarded for completing Python basics.",
  criteria: "Pass the final test with 60% and submit three exercises.",
  outcomeIds: ["outcome-py-1"],
  imageAssetId: "asset-badge-python",
  format: "open_badges_3",
  validityMonths: null,
  status: "active",
  createdAt: "2026-06-01T08:00:00Z",
  updatedAt: "2026-06-01T08:00:00Z",
};
const credential: IssuedCredential = {
  id: "credential-1",
  tenantId: "tenant-academy",
  templateId: badge.id,
  learnerId: "learner-sam",
  format: "open_badges_3",
  credentialUri: "urn:uuid:3f1e2d4c-5b6a-4789-8a1b-2c3d4e5f6a7b",
  issuerId: "did:web:academy.example.org",
  recipientIdentityHash: `sha256$${"c".repeat(64)}`,
  issuedAt: "2026-08-01T10:00:00Z",
  expiresAt: null,
  status: "issued",
  revokedAt: null,
  revokedReason: null,
  verificationCode: "PYB7K2Q9",
  statusListIndex: 1042,
  proof: {
    type: "DataIntegrityProof",
    verificationMethod: "did:web:academy.example.org#key-1",
    created: "2026-08-01T10:00:00Z",
  },
  evidenceEntryIds: ["entry-final-test"],
  issuedByStaffProfileId: "staff-academy-lead",
};
const valid: CredentialVerification = {
  verificationCode: credential.verificationCode,
  result: "valid",
  kind: "badge",
  credentialName: "Python basics",
  institutionName: "Example Online Academy",
  issuedOn: "2026-08-01",
  expiresOn: null,
};

describe("credential templates", () => {
  it("accepts a badge and a diploma template", () => {
    expect(CredentialTemplateSchema.safeParse(badge).success).toBe(true);
    const diploma = {
      ...badge,
      id: "template-bsc",
      code: "BSC-CS",
      kind: "diploma",
      name: "B.Sc. Computer Science",
      format: "w3c_vc",
      validityMonths: null,
    };
    expect(CredentialTemplateSchema.safeParse(diploma).success).toBe(true);
  });

  it("rejects templates without criteria", () => {
    expect(CredentialTemplateSchema.safeParse({ ...badge, criteria: " " }).success).toBe(false);
    expect(CredentialTemplateSchema.safeParse({ ...badge, validityMonths: 0 }).success).toBe(false);
  });
});

describe("issued credentials", () => {
  it("accepts an OB3 and a W3C credential, a PDF-only certificate and each status", () => {
    expect(IssuedCredentialSchema.safeParse(credential).success).toBe(true);
    expect(
      IssuedCredentialSchema.safeParse({
        ...credential,
        format: "w3c_vc",
        issuerId: "https://academy.example.org/issuer",
      }).success,
    ).toBe(true);
    const pdf = { ...credential, format: "pdf_only", proof: null, statusListIndex: null };
    expect(IssuedCredentialSchema.safeParse(pdf).success).toBe(true);
    const revoked = {
      ...credential,
      status: "revoked",
      revokedAt: "2026-09-01T10:00:00Z",
      revokedReason: "Issued in error.",
    };
    expect(IssuedCredentialSchema.safeParse(revoked).success).toBe(true);
    const expired = { ...credential, status: "expired", expiresAt: "2026-08-31T00:00:00Z" };
    expect(IssuedCredentialSchema.safeParse(expired).success).toBe(true);
  });

  it("refuses key material, emails and malformed identifiers", () => {
    expect(IssuedCredentialSchema.safeParse({ ...credential, privateKey: "…" }).success).toBe(
      false,
    );
    expect(
      IssuedCredentialSchema.safeParse({ ...credential, recipientEmail: "sam@example.org" })
        .success,
    ).toBe(false);
    expect(
      IssuedCredentialSchema.safeParse({ ...credential, credentialUri: "uuid:3f1e" }).success,
    ).toBe(false);
    expect(
      IssuedCredentialSchema.safeParse({ ...credential, recipientIdentityHash: "c".repeat(64) })
        .success,
    ).toBe(false);
    expect(
      IssuedCredentialSchema.safeParse({ ...credential, issuerId: "http://academy.example.org" })
        .success,
    ).toBe(false);
    expect(
      IssuedCredentialSchema.safeParse({ ...credential, verificationCode: "pyb7k2q9" }).success,
    ).toBe(false);
  });

  it("rejects bad dates, revocation and proof rules", () => {
    expect(
      IssuedCredentialSchema.safeParse({ ...credential, expiresAt: credential.issuedAt }).success,
    ).toBe(false);
    expect(
      IssuedCredentialSchema.safeParse({
        ...credential,
        status: "revoked",
        revokedAt: "2026-09-01T10:00:00Z",
      }).success,
    ).toBe(false);
    expect(IssuedCredentialSchema.safeParse({ ...credential, revokedReason: "x" }).success).toBe(
      false,
    );
    expect(IssuedCredentialSchema.safeParse({ ...credential, status: "expired" }).success).toBe(
      false,
    );
    expect(IssuedCredentialSchema.safeParse({ ...credential, format: "pdf_only" }).success).toBe(
      false,
    );
    expect(IssuedCredentialSchema.safeParse({ ...credential, proof: null }).success).toBe(false);
    expect(IssuedCredentialSchema.safeParse({ ...credential, statusListIndex: null }).success).toBe(
      false,
    );
  });
});

describe("public verification", () => {
  it("accepts each result", () => {
    expect(CredentialVerificationSchema.safeParse(valid).success).toBe(true);
    expect(CredentialVerificationSchema.safeParse({ ...valid, result: "revoked" }).success).toBe(
      true,
    );
    expect(
      CredentialVerificationSchema.safeParse({
        ...valid,
        result: "expired",
        expiresOn: "2026-08-31",
      }).success,
    ).toBe(true);
    const notFound = {
      verificationCode: "ZZZZZZZZ",
      result: "not_found",
      kind: null,
      credentialName: null,
      institutionName: null,
      issuedOn: null,
      expiresOn: null,
    };
    expect(CredentialVerificationSchema.safeParse(notFound).success).toBe(true);
  });

  it("shows details exactly when found and never learner data", () => {
    expect(CredentialVerificationSchema.safeParse({ ...valid, result: "not_found" }).success).toBe(
      false,
    );
    expect(CredentialVerificationSchema.safeParse({ ...valid, credentialName: null }).success).toBe(
      false,
    );
    expect(CredentialVerificationSchema.safeParse({ ...valid, result: "expired" }).success).toBe(
      false,
    );
    expect(CredentialVerificationSchema.safeParse({ ...valid, learnerName: "Sam" }).success).toBe(
      false,
    );
  });
});
