import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, MISSING_CREDENTIALS, SKIP_REASON, realSignIn } from "./helpers";

test.skip(MISSING_CREDENTIALS, SKIP_REASON);

/**
 * Performance budgets on demo data (NEX-065, docs/TIMINGS.md). Soft: an over-budget result prints
 * `WARN: over budget` and never fails the run.
 *
 * - `api:list:p95`: p95 of every list endpoint (first page) over 20 calls each, signed in, through the dev proxy.
 * - `load:4g`: cold first load of the **built** app (`pnpm --filter campus real:preview`, port 3101) on a 4G
 *   profile (150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up, as Lighthouse's mobile "slow 4G"), until the sign-in
 *   button is visible. Skipped when no built app answers on `NEXUS_E2E_BUILT_URL`.
 */
const LIST_ENDPOINTS = [
  "access-grants", "access-requests", "audit-checkpoints", "break-glass-notices", "compliance-packs", "consents",
  "data-requests", "devices", "entitlements", "fonts", "notification-deliveries", "notification-templates",
  "people", "permissions", "role-assignments", "roles", "sessions", "sso-providers", "sync-conflicts",
  "texts/overrides", "texts/revisions", "usage", "users", "vault/keys",
]; // prettier-ignore
const CALLS = 20;
const API_P95_BUDGET_MS = 300;
const LOAD_4G_BUDGET_MS = 6000;
const BUILT_URL = process.env["NEXUS_E2E_BUILT_URL"] ?? "http://127.0.0.1:3101";

function report(label: string, ms: number, budget: number) {
  const status = ms <= budget ? "OK" : "WARN: over budget";
  console.log(
    `[timing] ${label}: ${(ms / 1000).toFixed(3)}s (budget ${(budget / 1000).toFixed(1)}s — ${status})`,
  );
}

const p95 = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
};

test("@real perf: list endpoint p95 on demo data", async ({ page }) => {
  await realSignIn(page, ADMIN_EMAIL);
  const all: number[] = [];
  const rows: string[] = [];
  for (const endpoint of LIST_ENDPOINTS) {
    const times: number[] = [];
    for (let i = 0; i < CALLS; i += 1) {
      const started = performance.now();
      const res = await page.request.get(`/api/v1/${endpoint}?pageSize=50`);
      times.push(performance.now() - started);
      expect(res.status(), endpoint).toBe(200);
    }
    all.push(...times);
    rows.push(`${endpoint.padEnd(24)} p95 ${p95(times).toFixed(1)} ms`);
  }
  console.log(rows.join("\n"));
  report("api:list:p95", p95(all), API_P95_BUDGET_MS);
});

test("@real perf: first load of the built app on 4G", async ({ browser }) => {
  const reachable = await fetch(BUILT_URL).then(
    (r) => r.ok,
    () => false,
  );
  test.skip(
    !reachable,
    `No built app on ${BUILT_URL}: run pnpm --filter campus real:build && real:preview`,
  );
  const context = await browser.newContext(); // cold: no cache, no service worker
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  const started = Date.now();
  await page.goto(`${BUILT_URL}/`);
  await expect(page.locator("#main-content button").filter({ visible: true }).first()).toBeVisible({
    timeout: 60_000,
  });
  const ms = Date.now() - started;
  const transferred = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .concat(performance.getEntriesByType("navigation"))
      .reduce((sum, e) => sum + ((e as PerformanceResourceTiming).transferSize || 0), 0),
  );
  console.log(`first load transferred ${(transferred / 1024).toFixed(0)} KiB`);
  report("load:4g", ms, LOAD_4G_BUDGET_MS);
  await context.close();
});
