import { defineConfig, devices } from "@playwright/test";

/**
 * Opt-in real-data run (NEX-060), not part of `pnpm e2e`. Needs, already running: Compose
 * (`uv run --project backend nexus-compose-up`), a migrated and seeded database, `nexus-keycloak-dev`, the backend
 * (`uv run --project backend nexus-dev`) and the app in real mode (`pnpm dev:real`). Credentials of a seeded admin
 * come from `NEXUS_E2E_EMAIL` / `NEXUS_E2E_PASSWORD` (never committed).
 */
export default defineConfig({
  testDir: ".",
  outputDir: "../../test-results/real",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
});
