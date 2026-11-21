import { describe, expect, it } from "vitest";
import {
  BackupJobSchema,
  DiagnosticBundleSchema,
  InstallStatusSchema,
  LicenceSummarySchema,
  UpdateOfferSchema,
} from "./install";

const rejects = (schema: { safeParse: (v: unknown) => { success: boolean } }, cases: unknown[]) => {
  for (const c of cases) expect(schema.safeParse(c).success, JSON.stringify(c)).toBe(false);
};

const licence = {
  edition: "enterprise",
  state: "active",
  expiresAt: "2027-01-09",
  supportEndsAt: "2027-01-09",
  learnerCap: 12000,
  learnersUsed: 9876,
  campusCap: 3,
  campusesUsed: 2,
  graceEndsAt: null,
};

const status = {
  installId: "dep_nb",
  version: "2.4.0",
  channel: "lts",
  licence,
  airGapped: false,
  telemetryEnabled: true,
  lastUpdateCheckAt: "2026-11-21T02:00:00Z",
  lastBackupAt: "2026-11-21T01:00:00Z",
};

describe("InstallStatus and LicenceSummary", () => {
  it("accepts an online and an air-gapped install, and a licence in grace", () => {
    expect(InstallStatusSchema.safeParse(status).success).toBe(true);
    expect(
      InstallStatusSchema.safeParse({
        ...status,
        airGapped: true,
        telemetryEnabled: false,
        lastUpdateCheckAt: null,
      }).success,
    ).toBe(true);
    expect(
      LicenceSummarySchema.safeParse({ ...licence, state: "grace", graceEndsAt: "2027-02-08" })
        .success,
    ).toBe(true);
  });

  it("rejects an air-gapped install that phones home and grace without an end", () => {
    rejects(InstallStatusSchema, [{ ...status, airGapped: true }]);
    rejects(LicenceSummarySchema, [
      { ...licence, state: "grace" },
      { ...licence, learnerCap: 0 },
    ]);
  });
});

describe("UpdateOffer, BackupJob", () => {
  it("accepts valid rows", () => {
    expect(
      UpdateOfferSchema.safeParse({
        version: "2.4.1",
        channel: "lts",
        source: "offline_bundle",
        signatureValid: true,
        securityFix: true,
        releaseNotes: "Security fix.",
        coveredBySupport: true,
      }).success,
    ).toBe(true);
    expect(
      BackupJobSchema.safeParse({
        id: "bkp_1",
        kind: "backup",
        status: "done",
        encrypted: true,
        sizeBytes: 5_368_709_120,
        startedAt: "2026-11-21T01:00:00Z",
        finishedAt: "2026-11-21T01:20:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects unencrypted backups and finished jobs without an end", () => {
    const job = {
      id: "bkp_1",
      kind: "tenant_export",
      status: "running",
      encrypted: true,
      sizeBytes: null,
      startedAt: "2026-11-21T01:00:00Z",
      finishedAt: null,
    };
    rejects(BackupJobSchema, [
      { ...job, encrypted: false },
      { ...job, status: "done" },
      { ...job, status: "done", finishedAt: "2026-11-21T02:00:00Z" },
    ]);
  });
});

describe("DiagnosticBundle", () => {
  const bundle = {
    id: "diag_1",
    status: "ready_for_review",
    scrubbed: true,
    sizeBytes: 1_200_000,
    ticketRef: "TCK-2026-0042",
    createdAt: "2026-11-21T03:00:00Z",
    reviewedBy: null,
    sentAt: null,
  };

  it("accepts a bundle waiting for review and a sent one", () => {
    expect(DiagnosticBundleSchema.safeParse(bundle).success).toBe(true);
    expect(
      DiagnosticBundleSchema.safeParse({
        ...bundle,
        status: "sent",
        reviewedBy: "usr_admin",
        sentAt: "2026-11-21T03:10:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects unscrubbed bundles and sending without a reviewer", () => {
    rejects(DiagnosticBundleSchema, [
      { ...bundle, scrubbed: false },
      { ...bundle, status: "sent", sentAt: "2026-11-21T03:10:00Z" },
      { ...bundle, status: "approved" },
      { ...bundle, reviewedBy: "usr_admin" },
    ]);
  });
});
