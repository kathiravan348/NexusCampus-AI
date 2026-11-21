import { describe, expect, it } from "vitest";
import { DeploymentSchema, HealthSignalSchema } from "./deployment";
import { rejects } from "./test-utils";

const cell = {
  id: "dep_in_1",
  name: "IN shared cell 1",
  kind: "saas_shared_cell",
  accountId: null,
  region: "in",
  version: "2.4.0",
  channel: "stable",
  health: "healthy",
  lastCheckInAt: "2026-11-21T06:00:00Z",
  telemetryEnabled: true,
  airGapped: false,
  extensionIds: [],
  tenantCount: 812,
};

const airGapped = {
  ...cell,
  id: "dep_nb",
  name: "Northbridge on-premise",
  kind: "self_hosted",
  accountId: "acc_northbridge",
  region: "eu",
  channel: "lts",
  health: "unknown",
  lastCheckInAt: null,
  telemetryEnabled: false,
  airGapped: true,
  extensionIds: ["ext_nb_grading"],
  tenantCount: 1,
};

describe("Deployment", () => {
  it("accepts a shared cell and an air-gapped install", () => {
    expect(DeploymentSchema.safeParse(cell).success).toBe(true);
    expect(DeploymentSchema.safeParse(airGapped).success).toBe(true);
  });

  it("rejects inconsistent ownership, health, air-gap and versions", () => {
    rejects(DeploymentSchema, [
      { ...cell, accountId: "acc_x" },
      { ...airGapped, accountId: null },
      { ...cell, telemetryEnabled: false },
      { ...cell, airGapped: true, telemetryEnabled: false, health: "unknown", lastCheckInAt: null },
      { ...airGapped, lastCheckInAt: "2026-11-21T06:00:00Z" },
      { ...cell, version: "v2.4" },
      { ...airGapped, extensionIds: ["e", "e"] },
    ]);
  });
});

describe("HealthSignal", () => {
  const signal = {
    deploymentId: "dep_in_1",
    at: "2026-11-21T06:00:00Z",
    version: "2.4.0",
    uptimePct: 99.98,
    errorRatePct: 0.02,
    p95LatencyMs: 180,
    queueDepth: 3,
    diskUsedPct: 41.5,
    activeUsers: 2210,
  };

  it("accepts counts and rates", () => {
    expect(HealthSignalSchema.safeParse(signal).success).toBe(true);
  });

  it("rejects out-of-range values and anything personal", () => {
    rejects(HealthSignalSchema, [
      { ...signal, uptimePct: 101 },
      { ...signal, activeUsers: -1 },
      { ...signal, topUsers: ["a@b.example"] },
    ]);
  });
});
