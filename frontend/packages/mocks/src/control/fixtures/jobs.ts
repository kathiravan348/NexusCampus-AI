import type {
  OffboardingJob,
  PortabilityJob,
  ProvisioningJob,
  Sandbox,
  ShredCertificate,
  StepStatus,
} from "@nexus/contracts";
import { TENANT } from "../../fixtures/ids";
import { ACCOUNT, MOCK_SIGNATURE, STAFF } from "./ids";

const steps = <T extends string>(names: readonly T[], statuses: readonly StepStatus[]) =>
  names.map((name, i) => ({ name, status: statuses[i] ?? "pending" }));

const PROVISIONING_STEPS = [
  "create_tenant",
  "create_keys",
  "apply_profile",
  "seed",
  "invite_owner",
] as const;

/** Tenant creation (P04): Harmony's finished trial set-up and Sunrise's, still running. */
export const PROVISIONING_JOBS = [
  {
    id: "prv-hm",
    request: {
      accountId: ACCOUNT.harmony,
      region: "apac",
      institutionType: "sk",
      planCode: "starter",
      trialDays: 30,
      deliveryModel: "saas_shared",
    },
    steps: steps(PROVISIONING_STEPS, ["done", "done", "done", "done", "done"]),
    status: "done",
    tenantId: TENANT.harmony,
    requestedByStaffId: STAFF.sales,
    createdAt: "2026-08-20T02:00:00Z",
  },
  {
    id: "prv-sr",
    request: {
      accountId: ACCOUNT.sunrise,
      region: "in",
      institutionType: "ey",
      planCode: "standard",
      trialDays: 30,
      deliveryModel: "saas_shared",
    },
    steps: steps(PROVISIONING_STEPS, ["done", "done", "done", "running", "pending"]),
    status: "running",
    tenantId: "ten-sr",
    requestedByStaffId: STAFF.implementation,
    createdAt: "2026-09-14T05:05:00Z",
  },
] satisfies readonly ProvisioningJob[];

/** Old Mill left in January: export handed over, keys destroyed, certificate issued (V-2). */
export const OFFBOARDING_JOBS = [
  {
    id: "off-om",
    accountId: ACCOUNT.oldMill,
    tenantId: "ten-om",
    steps: steps(
      [
        "freeze_writes",
        "export_ready",
        "export_downloaded",
        "keys_destroyed",
        "certificate_issued",
      ],
      ["done", "done", "done", "done", "done"],
    ),
    status: "done",
    shredCertificateId: "shc-om",
    requestedByStaffId: STAFF.implementation,
    createdAt: "2026-02-01T09:00:00Z",
  },
] satisfies readonly OffboardingJob[];

export const SHRED_CERTIFICATES = [
  {
    id: "shc-om",
    tenantId: "ten-om",
    keyIds: ["key-om-tenant-data", "key-om-field-identity", "key-om-field-finance"],
    destroyedAt: "2026-03-03T10:00:00Z",
    signingKeyId: "nexus-shred-2026",
    signature: MOCK_SIGNATURE,
  },
] satisfies readonly ShredCertificate[];

const MOVE_STEPS = [
  "preflight",
  "export_encrypted",
  "transfer",
  "import",
  "verify",
  "cutover",
  "shred_source",
] as const;

/** Tenant moves (P18, DM-8): Coastal moved on-premise last year; Riverside is checking a move. */
export const PORTABILITY_JOBS = [
  {
    id: "mov-ct",
    accountId: ACCOUNT.coastal,
    tenantId: "ten-ct",
    direction: "saas_to_self_hosted",
    fromRegion: "in",
    toRegion: "in",
    steps: steps(MOVE_STEPS, ["done", "done", "done", "done", "done", "done", "done"]),
    status: "done",
    encrypted: true,
    createdAt: "2026-03-20T04:00:00Z",
  },
  {
    id: "mov-rv",
    accountId: ACCOUNT.riverside,
    tenantId: TENANT.riverside,
    direction: "saas_to_self_hosted",
    fromRegion: "eu",
    toRegion: "eu",
    steps: steps(MOVE_STEPS, ["running"]),
    status: "running",
    encrypted: true,
    createdAt: "2026-09-12T09:00:00Z",
  },
] satisfies readonly PortabilityJob[];

/** Sales demos with synthetic data and one masked staging clone (P17). */
export const SANDBOXES = [
  {
    id: "sbx-demo-ey",
    kind: "sales_demo",
    accountId: ACCOUNT.sunrise,
    institutionType: "ey",
    region: "in",
    dataKind: "synthetic",
    version: "2.4.1",
    status: "ready",
    createdAt: "2026-09-10T05:00:00Z",
    expiresAt: "2026-09-24T05:00:00Z",
  },
  {
    id: "sbx-demo-tp",
    kind: "sales_demo",
    accountId: null,
    institutionType: "tp",
    region: "in",
    dataKind: "synthetic",
    version: "2.4.0",
    status: "expired",
    createdAt: "2026-08-01T05:00:00Z",
    expiresAt: "2026-08-15T05:00:00Z",
  },
  {
    id: "sbx-stg-nb",
    kind: "staging_clone",
    accountId: ACCOUNT.northbridge,
    institutionType: "he",
    region: "us",
    dataKind: "masked",
    version: "2.5.0-rc.1",
    status: "ready",
    createdAt: "2026-09-11T00:00:00Z",
    expiresAt: "2026-10-11T00:00:00Z",
  },
] satisfies readonly Sandbox[];
