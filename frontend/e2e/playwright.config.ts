import { defineConfig, devices } from "@playwright/test";

/**
 * Stage 1 review build checks (NEX-021). The mock production build is built in `--mode review` (as
 * `pnpm review:start`) and served by `vite preview` (with the PWA worker, so offline really works); the
 * pseudo-locale `en-XA` exists only in dev, so its spec uses a dev server.
 */
const PREVIEW = "http://127.0.0.1:4310";
const DEV = "http://127.0.0.1:4311";

export default defineConfig({
  testDir: ".",
  outputDir: "../test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
  use: { baseURL: PREVIEW, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    {
      command:
        "pnpm --filter campus run review:build && pnpm --filter campus exec vite preview --mode review --host 127.0.0.1 --port 4310 --strictPort",
      cwd: "..",
      url: PREVIEW,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter campus exec vite --host 127.0.0.1 --port 4311 --strictPort",
      cwd: "..",
      url: DEV,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "desktop",
      testIgnore: [/pseudo\.spec\.ts/, /[\\/]real[\\/]/],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-360",
      testIgnore: [/pseudo\.spec\.ts/, /[\\/]real[\\/]/],
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 }, hasTouch: true },
    },
    {
      name: "pseudo-360",
      testMatch: /pseudo\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 }, baseURL: DEV },
    },
  ],
});
