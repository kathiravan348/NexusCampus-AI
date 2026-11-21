import { describe, expect, it } from "vitest";
import { ExtensionCompatibilitySchema, ExtensionSchema } from "./extension";
import { ReleaseSchema, RolloutSchema } from "./release";
import { rejects } from "./test-utils";

const release = {
  id: "rel_240",
  version: "2.4.0",
  channel: "stable",
  status: "published",
  publishedAt: "2026-11-01T10:00:00Z",
  signed: true,
  offlineBundle: true,
  minUpgradeFrom: "2.2.0",
  migrationNotes: "Adds two columns; forward-only.",
  notesAiDrafted: true,
};

describe("Release", () => {
  it("accepts published, draft and preview releases", () => {
    expect(ReleaseSchema.safeParse(release).success).toBe(true);
    expect(
      ReleaseSchema.safeParse({ ...release, status: "draft", publishedAt: null, signed: false })
        .success,
    ).toBe(true);
    expect(
      ReleaseSchema.safeParse({
        ...release,
        version: "2.5.0-rc.1",
        channel: "preview",
        offlineBundle: false,
      }).success,
    ).toBe(true);
  });

  it("rejects unsigned published releases, missing dates and preview bundles", () => {
    rejects(ReleaseSchema, [
      { ...release, signed: false },
      { ...release, publishedAt: null },
      { ...release, status: "draft" },
      { ...release, channel: "preview" },
      { ...release, version: "2.4" },
    ]);
  });
});

describe("Rollout", () => {
  const rollout = {
    id: "rol_1",
    releaseId: "rel_240",
    ring: 1,
    deploymentIds: ["dep_in_1"],
    status: "done",
    startedAt: "2026-11-02T00:00:00Z",
  };

  it("accepts started, pending and rolled-back rollouts", () => {
    expect(RolloutSchema.safeParse(rollout).success).toBe(true);
    expect(
      RolloutSchema.safeParse({ ...rollout, status: "pending", startedAt: null }).success,
    ).toBe(true);
    expect(RolloutSchema.safeParse({ ...rollout, status: "rolled_back" }).success).toBe(true);
  });

  it("rejects ring 4, empty or duplicate targets and a pending rollout with a start", () => {
    rejects(RolloutSchema, [
      { ...rollout, ring: 4 },
      { ...rollout, deploymentIds: [] },
      { ...rollout, deploymentIds: ["d", "d"] },
      { ...rollout, status: "pending" },
    ]);
  });
});

describe("Extension and compatibility", () => {
  const extension = {
    id: "ext_nb_grading",
    accountId: "acc_northbridge",
    code: "nb-grading",
    name: "Northbridge credit grading",
    version: "1.3.0",
    signed: true,
    builtAt: "2026-10-20T00:00:00Z",
  };
  const check = {
    extensionId: "ext_nb_grading",
    releaseVersion: "2.4.0",
    result: "warning",
    notes: "Uses a field renamed in 2.4; still works through the alias.",
    aiDrafted: true,
    checkedAt: "2026-10-30T00:00:00Z",
  };

  it("accepts valid rows", () => {
    expect(ExtensionSchema.safeParse(extension).success).toBe(true);
    expect(ExtensionCompatibilitySchema.safeParse(check).success).toBe(true);
    expect(
      ExtensionCompatibilitySchema.safeParse({ ...check, result: "compatible", notes: "" }).success,
    ).toBe(true);
  });

  it("rejects a warning without notes and bad codes", () => {
    rejects(ExtensionCompatibilitySchema, [{ ...check, notes: " " }]);
    rejects(ExtensionSchema, [{ ...extension, code: "NB Grading" }]);
  });
});
