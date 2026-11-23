import { describe, expect, it } from "vitest";
import {
  ConfirmMoveStepSchema,
  PortabilityJobSchema,
  PortabilityRequestSchema,
  ShredCertificateSchema,
} from "./portability";
import { SandboxSchema } from "./sandbox";
import { rejects } from "./test-utils";

const steps = (statuses: string[]) =>
  ["preflight", "export_encrypted", "transfer", "import", "verify", "cutover", "shred_source"].map(
    (name, i) => ({ name, status: statuses[i] }),
  );

const job = {
  id: "mov_1",
  accountId: "acc_riverside",
  tenantId: "ten_riverside",
  direction: "saas_to_self_hosted",
  fromRegion: "in",
  toRegion: "in",
  steps: steps(["done", "done", "running", "pending", "pending", "pending", "pending"]),
  status: "running",
  encrypted: true,
  createdAt: "2026-11-18T00:00:00Z",
};

describe("PortabilityJob", () => {
  it("accepts a move and a region move", () => {
    expect(PortabilityJobSchema.safeParse(job).success).toBe(true);
    expect(
      PortabilityJobSchema.safeParse({ ...job, direction: "region_move", toRegion: "eu" }).success,
    ).toBe(true);
  });

  it("rejects unencrypted moves, same-region moves and wrong step lists", () => {
    rejects(PortabilityJobSchema, [
      { ...job, encrypted: false },
      { ...job, direction: "region_move" },
      { ...job, steps: job.steps.slice(0, 6) },
      { ...job, status: "done" },
    ]);
  });
});

describe("PortabilityRequest and ConfirmMoveStep", () => {
  const samplePem = `-----BEGIN PUBLIC KEY-----\n${"MIIBojANBgkqhkiG9w0BAQEFAAOCAY8A".repeat(4)}\n-----END PUBLIC KEY-----`;
  const req = {
    accountId: "acc-ls",
    tenantId: "ten-ls",
    direction: "region_move",
    toRegion: "eu",
  };

  it("accepts valid portability requests and step confirmations", () => {
    expect(PortabilityRequestSchema.safeParse(req).success).toBe(true);
    expect(ConfirmMoveStepSchema.safeParse({ step: "preflight", pem: samplePem }).success).toBe(
      true,
    );
    expect(
      ConfirmMoveStepSchema.safeParse({
        step: "export_encrypted",
        fileName: "ten-ls.nxte",
        rows: 81,
      }).success,
    ).toBe(true);
    expect(ConfirmMoveStepSchema.safeParse({ step: "transfer" }).success).toBe(true);
    expect(
      ConfirmMoveStepSchema.safeParse({
        step: "import",
        rows: 81,
        chainOk: true,
        checkpointOk: true,
      }).success,
    ).toBe(true);
    expect(ConfirmMoveStepSchema.safeParse({ step: "cutover" }).success).toBe(true);
    expect(ConfirmMoveStepSchema.safeParse({ step: "shred_source" }).success).toBe(true);
  });

  it("rejects bad directions, path traversal file names, zero rows and extra fields", () => {
    rejects(PortabilityRequestSchema, [
      { ...req, accountId: "" },
      { ...req, direction: "invalid" },
      { ...req, toRegion: "mars" },
      { ...req, extra: 1 },
    ]);
    rejects(ConfirmMoveStepSchema, [
      { step: "unknown" },
      { step: "preflight", pem: "too-short" },
      { step: "export_encrypted", fileName: "../secret.nxte", rows: 10 },
      { step: "export_encrypted", fileName: "dir/file.nxte", rows: 10 },
      { step: "export_encrypted", fileName: "..", rows: 10 },
      { step: "import", rows: 0 },
      { step: "transfer", extra: true },
    ]);
  });
});

describe("ShredCertificate", () => {
  const cert = {
    id: "shc_1",
    tenantId: "ten_old",
    keyIds: ["key_old_data", "key_old_health"],
    destroyedAt: "2026-10-05T00:00:00Z",
    signingKeyId: "nexus-shred-2026",
    signature: Buffer.alloc(64, 1).toString("base64"),
  };

  it("accepts a signed certificate", () => {
    expect(ShredCertificateSchema.safeParse(cert).success).toBe(true);
  });

  it("rejects no keys and a bad signature", () => {
    rejects(ShredCertificateSchema, [
      { ...cert, keyIds: [] },
      { ...cert, signature: "abc" },
    ]);
  });
});

describe("Sandbox", () => {
  const demo = {
    id: "sbx_1",
    kind: "sales_demo",
    accountId: null,
    institutionType: "ey",
    region: "in",
    dataKind: "synthetic",
    version: "2.4.0",
    status: "ready",
    createdAt: "2026-11-20T00:00:00Z",
    expiresAt: "2026-11-27T00:00:00Z",
  };

  it("accepts a demo and a staging clone", () => {
    expect(SandboxSchema.safeParse(demo).success).toBe(true);
    expect(
      SandboxSchema.safeParse({
        ...demo,
        kind: "staging_clone",
        accountId: "acc_riverside",
        dataKind: "masked",
      }).success,
    ).toBe(true);
  });

  it("rejects masked demos, clones without an account and no expiry", () => {
    rejects(SandboxSchema, [
      { ...demo, dataKind: "masked" },
      { ...demo, kind: "staging_clone" },
      { ...demo, expiresAt: demo.createdAt },
    ]);
  });
});
