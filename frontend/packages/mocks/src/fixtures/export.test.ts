import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { icuCasesJson, messageKeysJson } from "./catalogue";
import { designTokensJson } from "./design-tokens";
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

  it("matches the committed backend design tokens (contrast guard parity, NEX-053)", () => {
    const tokens = path.resolve(EXPORTED, "../../modules/m03/design_tokens.json");
    expect(readFileSync(tokens, "utf8").replace(/\r\n/g, "\n")).toBe(designTokensJson());
  });

  it("matches the committed backend message keys and ICU cases (texts API, NEX-054)", () => {
    const keys = path.resolve(EXPORTED, "../../modules/m04/message_keys.json");
    const cases = path.resolve(EXPORTED, "../../../../tests/m04/icu_cases.json");
    expect(readFileSync(keys, "utf8").replace(/\r\n/g, "\n")).toBe(messageKeysJson());
    expect(readFileSync(cases, "utf8").replace(/\r\n/g, "\n")).toBe(icuCasesJson());
  });
});
