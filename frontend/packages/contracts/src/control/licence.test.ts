import { describe, expect, it } from "vitest";
import { LicenceFileSchema, LicenceSchema } from "./licence";
import { rejects } from "./test-utils";

const terms = {
  id: "lic_nb_2026",
  accountId: "acc_northbridge",
  edition: "enterprise",
  modules: ["M01", "M02", "M03"],
  learnerCap: 12000,
  campusCap: 3,
  issuedAt: "2026-01-10T00:00:00Z",
  expiresAt: "2027-01-09",
  supportEndsAt: "2027-01-09",
  graceDays: 30,
  activation: "offline",
  signingKeyId: "nexus-licence-2026",
};

const licence = {
  ...terms,
  state: "active",
  fingerprint: "a".repeat(64),
  deploymentId: "dep_nb",
};

const signature = Buffer.alloc(64, 7).toString("base64");

describe("Licence", () => {
  it("accepts a term licence and a perpetual one", () => {
    expect(LicenceSchema.safeParse(licence).success).toBe(true);
    expect(LicenceSchema.safeParse({ ...licence, expiresAt: null }).success).toBe(true);
  });

  it("rejects expiry before issue, a perpetual licence in grace, bad caps and fingerprints", () => {
    rejects(LicenceSchema, [
      { ...licence, expiresAt: "2025-12-31" },
      { ...licence, expiresAt: null, state: "grace" },
      { ...licence, learnerCap: 0 },
      { ...licence, modules: [] },
      { ...licence, modules: ["M01", "M01"] },
      { ...licence, fingerprint: "xyz" },
      { ...licence, graceDays: 91 },
    ]);
  });
});

describe("LicenceFile", () => {
  const file = { format: "nexus-licence/1", payload: terms, signature };

  it("accepts signed terms", () => {
    expect(LicenceFileSchema.safeParse(file).success).toBe(true);
  });

  it("rejects other formats, short signatures and state inside the payload", () => {
    rejects(LicenceFileSchema, [
      { ...file, format: "nexus-licence/2" },
      { ...file, signature: Buffer.alloc(32).toString("base64") },
      { ...file, signature: "not base64!" },
      { ...file, payload: { ...terms, state: "active" } },
    ]);
  });
});
