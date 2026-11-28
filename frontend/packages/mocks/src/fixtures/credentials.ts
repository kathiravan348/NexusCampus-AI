import type * as C from "@nexus/contracts";
import { INSTITUTION as I, PERSON as P, TENANT as T } from "./ids";
import { LEARNER as L } from "./ids-stage3";
import { PORTFOLIO_ENTRY } from "./ids-stage4-care";
import {
  CREDENTIAL_TEMPLATE as CT,
  CREDENTIAL_URI as CU,
  ISSUED_CREDENTIAL as IC,
  VERIFICATION_CODE as VC,
} from "./ids-stage4-engage";
import { CONTENT_ASSET as CA, OUTCOME as O } from "./ids-stage4-learning";
import { ROLE_PROFILES } from "./role-profiles";
import { CREATED_AT, UPDATED_AT } from "./tenants";

const rv = T.riverside;
const nb = T.northbridge;
const ts = { createdAt: CREATED_AT, updatedAt: UPDATED_AT };
const rvDid = "did:web:riverside.example.edu";
const nbDid = "did:web:northbridge.example.edu";
const identityHash = (seed: number) => `sha256$${seed.toString(16).padStart(64, "0")}`;

function staffId(tenantId: string, personId: string): string {
  const row = ROLE_PROFILES.find(
    (p) => p.tenantId === tenantId && p.personId === personId && p.kind === "staff",
  );
  if (!row) throw new Error(`Missing staff profile for ${personId}`);
  return row.id;
}

const rvAmira = staffId(rv, P.rvAmira);
const rvTom = staffId(rv, P.rvTom);
const nbRobert = staffId(nb, P.nbRobert);
const nbElena = staffId(nb, P.nbElena);

export const CREDENTIAL_TEMPLATES: readonly C.CredentialTemplate[] = [
  {
    id: CT.rvFracBadge,
    tenantId: rv,
    institutionId: I.riversideSchool,
    code: "RV-MATH-Y5",
    kind: "badge",
    name: "Fractions Explorer Badge",
    description: "Recognises consistent mastery of Year 5 equivalent fractions.",
    criteria: "Complete the Year 5 fractions assignment and reflection with teacher verification.",
    outcomeIds: [O.rvMathFrac],
    imageAssetId: CA.rvFractionChart,
    format: "open_badges_3",
    validityMonths: null,
    status: "active",
    ...ts,
  },
  {
    id: CT.rvSafetyCert,
    tenantId: rv,
    institutionId: I.riversideSchool,
    code: "RV-LAB-CERT",
    kind: "certificate",
    name: "Science Lab Safety Certificate",
    description: "Annual certificate for completing laboratory safety orientation.",
    criteria: "Pass the laboratory safety checklist under staff supervision.",
    outcomeIds: [O.rvEngRead],
    imageAssetId: null,
    format: "pdf_only",
    validityMonths: 12,
    status: "retired",
    ...ts,
  },
  {
    id: CT.nbCsMicro,
    tenantId: nb,
    institutionId: I.northbridge,
    code: "NB-CS101-MC",
    kind: "micro_credential",
    name: "Foundations of Programming Micro-Credential",
    description: "Verifies core competency in control flow, loops and structured testing.",
    criteria: "Earn at least 75% on CS101 labs and complete all verified lab exercises.",
    outcomeIds: [O.nbCo1, O.nbCo2],
    imageAssetId: null,
    format: "w3c_vc",
    validityMonths: 36,
    status: "active",
    ...ts,
  },
  {
    id: CT.nbBscsDiploma,
    tenantId: nb,
    institutionId: I.northbridge,
    code: "NB-BSCS-DIP",
    kind: "diploma",
    name: "Bachelor of Science in Computer Science",
    description: "Undergraduate degree credential for completing the BSCS programme.",
    criteria: "Satisfy all core, elective and capstone requirements in the degree audit.",
    outcomeIds: [O.nbPo1, O.nbPo2],
    imageAssetId: null,
    format: "w3c_vc",
    validityMonths: null,
    status: "draft",
    ...ts,
  },
];

export const ISSUED_CREDENTIALS: readonly C.IssuedCredential[] = [
  {
    id: IC.rvMiaBadge,
    tenantId: rv,
    templateId: CT.rvFracBadge,
    learnerId: L.rvMia,
    format: "open_badges_3",
    credentialUri: CU.rvMiaBadge,
    issuerId: rvDid,
    recipientIdentityHash: identityHash(1),
    issuedAt: "2026-09-18T12:00:00Z",
    expiresAt: null,
    status: "issued",
    revokedAt: null,
    revokedReason: null,
    verificationCode: VC.rvMiaBadge,
    statusListIndex: 0,
    proof: {
      type: "DataIntegrityProof",
      verificationMethod: `${rvDid}#key-1`,
      created: "2026-09-18T12:00:00Z",
    },
    evidenceEntryIds: [PORTFOLIO_ENTRY.reflection],
    issuedByStaffProfileId: rvAmira,
  },
  {
    id: IC.rvOliverExpired,
    tenantId: rv,
    templateId: CT.rvSafetyCert,
    learnerId: L.rvOliver,
    format: "pdf_only",
    credentialUri: CU.rvOliverExpired,
    issuerId: rvDid,
    recipientIdentityHash: identityHash(2),
    issuedAt: "2026-09-02T09:00:00Z",
    expiresAt: "2026-09-10T23:59:59Z",
    status: "expired",
    revokedAt: null,
    revokedReason: null,
    verificationCode: VC.rvOliverExpired,
    statusListIndex: null,
    proof: null,
    evidenceEntryIds: [],
    issuedByStaffProfileId: rvTom,
  },
  {
    id: IC.nbJordanRevoked,
    tenantId: nb,
    templateId: CT.nbCsMicro,
    learnerId: L.nbJordan,
    format: "w3c_vc",
    credentialUri: CU.nbJordanRevoked,
    issuerId: nbDid,
    recipientIdentityHash: identityHash(3),
    issuedAt: "2026-09-05T14:00:00Z",
    expiresAt: "2027-05-01T23:59:59Z",
    status: "revoked",
    revokedAt: "2026-09-12T16:30:00Z",
    revokedReason: "Issued in error prior to final lab verification.",
    verificationCode: VC.nbJordanRevoked,
    statusListIndex: 0,
    proof: {
      type: "Ed25519Signature2020",
      verificationMethod: `${nbDid}#key-1`,
      created: "2026-09-05T14:00:00Z",
    },
    evidenceEntryIds: [],
    issuedByStaffProfileId: nbElena,
  },
  {
    id: IC.nbAidenHidden,
    tenantId: nb,
    templateId: CT.nbCsMicro,
    learnerId: L.nbAiden,
    format: "w3c_vc",
    credentialUri: CU.nbAidenHidden,
    issuerId: nbDid,
    recipientIdentityHash: identityHash(4),
    issuedAt: "2026-09-11T15:00:00Z",
    expiresAt: "2027-05-01T23:59:59Z",
    status: "issued",
    revokedAt: null,
    revokedReason: null,
    verificationCode: VC.nbAidenHidden,
    statusListIndex: 1,
    proof: {
      type: "Ed25519Signature2020",
      verificationMethod: `${nbDid}#key-1`,
      created: "2026-09-11T15:00:00Z",
    },
    evidenceEntryIds: [],
    issuedByStaffProfileId: nbRobert,
  },
];

/**
 * Credentials hidden by their learner (`IssuedCredential` carries no visibility field yet; M45
 * handlers join on this set when checking learner share/hide preferences).
 */
export const HIDDEN_CREDENTIAL_IDS: readonly string[] = [IC.nbAidenHidden];

/** Public verification answers: identical shape for valid, revoked, expired and unknown codes. */
export const CREDENTIAL_VERIFICATIONS: readonly C.CredentialVerification[] = [
  {
    verificationCode: VC.rvMiaBadge,
    result: "valid",
    kind: "badge",
    credentialName: "Fractions Explorer Badge",
    institutionName: "Riverside School",
    issuedOn: "2026-09-18",
    expiresOn: null,
  },
  {
    verificationCode: VC.nbJordanRevoked,
    result: "revoked",
    kind: "micro_credential",
    credentialName: "Foundations of Programming Micro-Credential",
    institutionName: "Northbridge University",
    issuedOn: "2026-09-05",
    expiresOn: "2027-05-01",
  },
  {
    verificationCode: VC.rvOliverExpired,
    result: "expired",
    kind: "certificate",
    credentialName: "Science Lab Safety Certificate",
    institutionName: "Riverside School",
    issuedOn: "2026-09-02",
    expiresOn: "2026-09-10",
  },
  {
    verificationCode: VC.unknown,
    result: "not_found",
    kind: null,
    credentialName: null,
    institutionName: null,
    issuedOn: null,
    expiresOn: null,
  },
];
