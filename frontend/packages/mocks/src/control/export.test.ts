import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { controlFixturesJson } from "./export";
import { controlParitySamplesJson } from "./parity";

const EXPORTED = path.resolve(
  __dirname,
  "../../../../../backend/src/nexus/control/control_fixtures.json",
);
const PARITY = path.resolve(__dirname, "../../../../../backend/tests/parity/control_samples.json");

describe("control fixtures export (control backend seed, NEX-096)", () => {
  it("matches the committed JSON (run `pnpm --filter @nexus/mocks export:fixtures`)", () => {
    expect(readFileSync(EXPORTED, "utf8").replace(/\r\n/g, "\n")).toBe(controlFixturesJson());
  });

  it("matches the committed control contract parity samples (Pydantic models, NEX-116)", () => {
    expect(readFileSync(PARITY, "utf8").replace(/\r\n/g, "\n")).toBe(controlParitySamplesJson());
  });
});
