/**
 * Exports the demo tenancy fixtures as JSON for the backend seed (NEX-043):
 * `pnpm --filter @nexus/mocks export:fixtures` → `backend/src/nexus/seed/demo_fixtures.json`.
 * The mocks stay the single source of truth; `fixtures/export.test.ts` fails when the JSON is stale.
 * Fixtures are TypeScript with extension-less imports, so they are loaded through Vite (a root dev dependency).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXPORT_PATH = path.resolve(
  here,
  "../../../../backend/src/nexus/seed/demo_fixtures.json",
);
/** Theme tokens + contrast results for the backend guard (NEX-053). */
export const TOKENS_PATH = path.resolve(
  here,
  "../../../../backend/src/nexus/modules/m03/design_tokens.json",
);

/** Known message keys and formatjs ICU verdicts for the backend texts API (NEX-054). */
export const KEYS_PATH = path.resolve(
  here,
  "../../../../backend/src/nexus/modules/m04/message_keys.json",
);
export const ICU_CASES_PATH = path.resolve(here, "../../../../backend/tests/m04/icu_cases.json");

/** Staff and role permissions for the control backend seed (NEX-096). */
export const CONTROL_PATH = path.resolve(
  here,
  "../../../../backend/src/nexus/control/control_fixtures.json",
);

/** Contract parity samples with Zod's verdicts for the backend models (NEX-059). */
export const PARITY_PATH = path.resolve(here, "../../../../backend/tests/parity/samples.json");

const server = await createServer({
  root: path.resolve(here, ".."),
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const mod = (await server.ssrLoadModule("/src/fixtures/export.ts")) as {
    demoFixturesJson: () => string;
  };
  writeFileSync(EXPORT_PATH, mod.demoFixturesJson(), "utf8");
  console.log(`wrote ${path.relative(process.cwd(), EXPORT_PATH)}`);
  const tokens = (await server.ssrLoadModule("/src/fixtures/design-tokens.ts")) as {
    designTokensJson: () => string;
  };
  writeFileSync(TOKENS_PATH, tokens.designTokensJson(), "utf8");
  console.log(`wrote ${path.relative(process.cwd(), TOKENS_PATH)}`);
  const catalogue = (await server.ssrLoadModule("/src/fixtures/catalogue.ts")) as {
    messageKeysJson: () => string;
    icuCasesJson: () => string;
  };
  writeFileSync(KEYS_PATH, catalogue.messageKeysJson(), "utf8");
  writeFileSync(ICU_CASES_PATH, catalogue.icuCasesJson(), "utf8");
  console.log(`wrote ${path.relative(process.cwd(), KEYS_PATH)} and the ICU cases`);
  const parity = (await server.ssrLoadModule("/src/fixtures/parity.ts")) as {
    paritySamplesJson: () => string;
  };
  writeFileSync(PARITY_PATH, parity.paritySamplesJson(), "utf8");
  console.log(`wrote ${path.relative(process.cwd(), PARITY_PATH)}`);
  const control = (await server.ssrLoadModule("/src/control/export.ts")) as {
    controlFixturesJson: () => string;
  };
  writeFileSync(CONTROL_PATH, control.controlFixturesJson(), "utf8");
  console.log(`wrote ${path.relative(process.cwd(), CONTROL_PATH)}`);
} finally {
  await server.close();
}
