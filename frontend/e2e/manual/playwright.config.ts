import { defineConfig, devices } from "@playwright/test";

/**
 * User manual screenshots (docs/manual), not part of `pnpm e2e`. Serves the mock review build (sample data, no
 * server) and the static Storybook, and runs one browser at 1280×800; platform.spec.ts adds the dev stack's
 * tools when they run. `pnpm manual` then rebuilds docs/manual/USER-MANUAL.md.
 */
const PREVIEW = "http://127.0.0.1:4312";

export default defineConfig({
  testDir: ".",
  globalSetup: "./global-setup.ts",
  outputDir: "../../test-results/manual",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    baseURL: PREVIEW,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter campus run review:build && pnpm --filter campus exec vite preview --mode review --host 127.0.0.1 --port 4312 --strictPort",
      cwd: "../..",
      url: PREVIEW,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      // Nexus Control on mock data, for the "Nexus Control" pages (NEX-099).
      command:
        "pnpm --filter control run review:build && pnpm --filter control exec vite preview --mode review --host 127.0.0.1 --port 4314 --strictPort",
      cwd: "../..",
      url: "http://127.0.0.1:4314",
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      // The static Storybook build, for the "Component library" pages.
      command:
        "pnpm --filter ui-storybook run build && pnpm --filter campus exec vite preview --outDir ../../packages/ui-storybook/storybook-static --host 127.0.0.1 --port 4313 --strictPort",
      cwd: "../..",
      url: "http://127.0.0.1:4313/index.json",
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
