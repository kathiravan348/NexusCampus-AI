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
} finally {
  await server.close();
}
