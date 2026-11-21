import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { controlFixturesJson } from "./export";

const EXPORTED = path.resolve(
  __dirname,
  "../../../../../backend/src/nexus/control/control_fixtures.json",
);

describe("control fixtures export (control backend seed, NEX-096)", () => {
  it("matches the committed JSON (run `pnpm --filter @nexus/mocks export:fixtures`)", () => {
    expect(readFileSync(EXPORTED, "utf8").replace(/\r\n/g, "\n")).toBe(controlFixturesJson());
  });
});
