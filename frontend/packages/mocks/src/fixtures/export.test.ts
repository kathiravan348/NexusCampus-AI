import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { demoFixtures, demoFixturesJson } from "./export";

const EXPORTED = path.resolve(
  __dirname,
  "../../../../../backend/src/nexus/seed/demo_fixtures.json",
);

describe("demo fixtures export (backend seed, NEX-043)", () => {
  it("gives every tenant a region the backend cells know (D45: in / eu) or a later region", () => {
    for (const t of demoFixtures().tenants) expect(t.region, t.id).toMatch(/^(in|eu|us|me|apac)$/);
  });

  it("matches the committed backend seed file (run `pnpm --filter @nexus/mocks export:fixtures`)", () => {
    expect(readFileSync(EXPORTED, "utf8").replace(/\r\n/g, "\n")).toBe(demoFixturesJson());
  });
});
