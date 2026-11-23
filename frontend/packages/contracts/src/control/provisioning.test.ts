import { describe, expect, it } from "vitest";
import {
  OffboardingJobSchema,
  OffboardingRequestSchema,
  ProvisioningJobSchema,
  ProvisioningRequestSchema,
} from "./provisioning";
import { rejects } from "./test-utils";

const request = {
  accountId: "acc_harmony",
  region: "in",
  institutionType: "sk",
  planCode: "starter",
  trialDays: 30,
  deliveryModel: "saas_shared",
};

const steps = (statuses: string[]) =>
  ["create_tenant", "create_keys", "apply_profile", "seed", "invite_owner"].map((name, i) => ({
    name,
    status: statuses[i],
  }));

const job = {
  id: "prv_1",
  request,
  steps: steps(["done", "done", "running", "pending", "pending"]),
  status: "running",
  tenantId: "ten_harmony",
  requestedByStaffId: "stf_arjun",
  createdAt: "2026-11-20T08:00:00Z",
};

describe("ProvisioningRequest", () => {
  it("accepts a SaaS request", () => {
    expect(ProvisioningRequestSchema.safeParse(request).success).toBe(true);
    expect(ProvisioningRequestSchema.safeParse({ ...request, trialDays: null }).success).toBe(true);
  });

  it("rejects self-hosted, long trials and bad plan codes", () => {
    rejects(ProvisioningRequestSchema, [
      { ...request, deliveryModel: "self_hosted" },
      { ...request, trialDays: 61 },
      { ...request, planCode: "Starter" },
    ]);
  });
});

describe("ProvisioningJob", () => {
  it("accepts running, done and pending jobs", () => {
    expect(ProvisioningJobSchema.safeParse(job).success).toBe(true);
    expect(
      ProvisioningJobSchema.safeParse({
        ...job,
        status: "done",
        steps: steps(Array(5).fill("done")),
      }).success,
    ).toBe(true);
    expect(
      ProvisioningJobSchema.safeParse({
        ...job,
        status: "pending",
        tenantId: null,
        steps: steps(Array(5).fill("pending")),
      }).success,
    ).toBe(true);
  });

  it("rejects missing or reordered steps, wrong status and tenantId before the tenant exists", () => {
    rejects(ProvisioningJobSchema, [
      { ...job, steps: job.steps.slice(1) },
      { ...job, steps: [...job.steps].reverse() },
      { ...job, status: "done" },
      { ...job, steps: steps(["done", "failed", "pending", "pending", "pending"]) },
      { ...job, tenantId: null },
    ]);
  });
});

describe("OffboardingJob", () => {
  const off = (statuses: string[], cert: string | null, status: string) => ({
    id: "off_1",
    accountId: "acc_old",
    tenantId: "ten_old",
    steps: [
      "freeze_writes",
      "export_ready",
      "export_downloaded",
      "keys_destroyed",
      "certificate_issued",
    ].map((name, i) => ({ name, status: statuses[i] })),
    status,
    shredCertificateId: cert,
    requestedByStaffId: "stf_lena",
    createdAt: "2026-10-01T00:00:00Z",
  });

  it("accepts a finished offboarding with a certificate", () => {
    expect(
      OffboardingJobSchema.safeParse(off(Array(5).fill("done"), "shc_1", "done")).success,
    ).toBe(true);
  });

  it("rejects a certificate before the keys are destroyed", () => {
    rejects(OffboardingJobSchema, [
      off(["done", "done", "running", "pending", "pending"], "shc_1", "running"),
      off(Array(5).fill("done"), null, "done"),
    ]);
  });
});

describe("OffboardingRequest", () => {
  const samplePem = `-----BEGIN PUBLIC KEY-----\n${"MIIBojANBgkqhkiG9w0BAQEFAAOCAY8A".repeat(4)}\n-----END PUBLIC KEY-----`;
  const offReq = {
    accountId: "acc-ls",
    tenantId: "ten-ls",
    recipientPem: samplePem,
  };

  it("accepts a valid offboarding request", () => {
    expect(OffboardingRequestSchema.safeParse(offReq).success).toBe(true);
  });

  it("rejects short or overlong PEMs, empty ids and extra fields", () => {
    rejects(OffboardingRequestSchema, [
      { ...offReq, accountId: "" },
      { ...offReq, tenantId: "" },
      { ...offReq, recipientPem: "short-pem" },
      { ...offReq, recipientPem: "A".repeat(1901) },
      { ...offReq, extra: true },
    ]);
  });
});
