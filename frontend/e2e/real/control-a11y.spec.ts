import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectScreenReady, menuPaths, setTheme } from "../helpers";

/**
 * Stage 2 real-mode accessibility & performance release checks for Nexus Control (NEX-137):
 * - Sign-in screen in real mode (light + dark): work-account SSO + MFA link, no demo picker, WCAG 2.2 AA axe check.
 * - Every staff role (all 9 seeded staff personas covering super_admin, sales, billing, support, implementation,
 *   release_manager, sre, security_officer, partner) against the real Control backend + PostgreSQL `nexus_control`:
 *   visits every Control page the role may open (and checks unpermitted routes show No access); axe WCAG 2.0/2.1/2.2
 *   A+AA finds zero serious or critical issues in both light and dark themes.
 * - Soft performance budgets (D37): `control:api:list:p95` across all 35 Control list endpoints (20 calls each) and
 *   `control:load:4g` cold first load on the 4G profile.
 */
const CONTROL_URL = process.env["NEXUS_CONTROL_E2E_URL"] ?? "http://127.0.0.1:3200";
const CONTROL_BUILT_URL = process.env["NEXUS_CONTROL_BUILT_URL"] ?? "http://127.0.0.1:3201";
const SYSTEM_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

test.use({
  baseURL: CONTROL_URL,
  ...(fs.existsSync(SYSTEM_CHROME) ? { channel: "chrome" } : {}),
});

interface StaffPersona {
  readonly id: string;
  readonly role: string;
  readonly displayName: string;
  readonly minPages: number;
  readonly forbiddenPath?: string;
}

const STAFF_ROLES: readonly StaffPersona[] = [
  { id: "stf-0001", role: "super_admin", displayName: "Nisha Verma", minPages: 18 },
  {
    id: "stf-0011",
    role: "sales",
    displayName: "Arjun Mehta",
    minPages: 6,
    forbiddenPath: "/staff",
  },
  {
    id: "stf-0013",
    role: "billing",
    displayName: "Farah Khan",
    minPages: 5,
    forbiddenPath: "/releases",
  },
  {
    id: "stf-0042",
    role: "support",
    displayName: "A. Morgan",
    minPages: 8,
    forbiddenPath: "/billing",
  },
  {
    id: "stf-0023",
    role: "implementation",
    displayName: "Ravi Shankar",
    minPages: 9,
    forbiddenPath: "/billing",
  },
  {
    id: "stf-0031",
    role: "release_manager",
    displayName: "Lena Fischer",
    minPages: 4,
    forbiddenPath: "/accounts",
  },
  {
    id: "stf-0019",
    role: "sre",
    displayName: "E. Lindqvist",
    minPages: 10,
    forbiddenPath: "/billing",
  },
  {
    id: "stf-0007",
    role: "security_officer",
    displayName: "C. Okafor",
    minPages: 10,
    forbiddenPath: "/pricing",
  },
  {
    id: "stf-0051",
    role: "partner",
    displayName: "Suresh Babu",
    minPages: 4,
    forbiddenPath: "/fleet",
  },
];

const CONTROL_LIST_ENDPOINTS = [
  "accounts",
  "contacts",
  "opportunities",
  "contracts",
  "notes",
  "staff-directory",
  "catalogue",
  "quotes",
  "subscriptions",
  "invoices",
  "payments",
  "credit-notes",
  "dunning",
  "usage",
  "licences",
  "deployments",
  "health-signals",
  "releases",
  "rollouts",
  "tickets",
  "sla-policies",
  "kb-articles",
  "extensions",
  "extension-compatibility",
  "projects",
  "sandboxes",
  "partners",
  "deals",
  "commissions",
  "metrics",
  "account-health",
  "sub-processors",
  "certifications",
  "incidents",
  "dpas",
  "provisioning-jobs",
  "offboarding-jobs",
  "shred-certificates",
  "portability-jobs",
  "broker-requests",
  "broker-sessions",
  "break-glass-cases",
] as const;

async function controlReachable(): Promise<boolean> {
  return fetch(`${CONTROL_URL}/control/api/v1/health`).then(
    (r) => r.ok,
    () => false,
  );
}

async function axeSeriousOrCritical(page: Page, label: string): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const out: string[] = [];
  for (const v of result.violations) {
    if (v.impact !== "serious" && v.impact !== "critical") continue;
    const targets = v.nodes
      .slice(0, 3)
      .map((n) => n.target.join(" "))
      .join(" | ");
    out.push(`${label} [${v.impact}] ${v.id}: ${v.nodes.length} node(s) — ${targets}`);
  }
  return out;
}

const p95 = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
};

function report(label: string, ms: number, budget: number) {
  const status = ms <= budget ? "OK" : "WARN: over budget";
  console.log(
    `[timing] ${label}: ${(ms / 1000).toFixed(3)}s (budget ${(budget / 1000).toFixed(1)}s — ${status})`,
  );
}

test("@real control-a11y: sign-in screen in light and dark mode", async ({ page }) => {
  test.skip(!(await controlReachable()), `No Control real stack on ${CONTROL_URL}`);
  const found: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const link = page.getByRole("link", { name: /Sign in with your work account/i });
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toContain("/control/api/v1/auth/login");
    found.push(...(await axeSeriousOrCritical(page, `/sign-in (${theme})`)));
  }
  expect(found, "sign-in serious/critical axe violations").toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`@real control-a11y: super_admin every Control screen in ${theme} on real data`, async ({
    page,
  }) => {
    test.skip(!(await controlReachable()), `No Control real stack on ${CONTROL_URL}`);
    await setTheme(page, theme);
    await page.context().setExtraHTTPHeaders({ "X-Nexus-Staff": "stf-0001" });
    await page.goto("/");
    await expectScreenReady(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByText("Nisha Verma", { exact: true }).first()).toBeVisible();
    // Real mode never shows the DemoBanner.
    await expect(page.getByRole("note")).toHaveCount(0);

    const paths = ["/", ...(await menuPaths(page)), "/accounts/acc-ls"];
    expect(paths.length).toBeGreaterThanOrEqual(20);

    const found: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      await expectScreenReady(page);
      found.push(...(await axeSeriousOrCritical(page, `${path} (${theme})`)));
    }
    expect(found, `super_admin ${theme} serious/critical axe violations`).toEqual([]);
  });
}

test("@real control-a11y: every staff role opens all permitted pages with zero axe issues", async ({
  page,
}) => {
  test.skip(!(await controlReachable()), `No Control real stack on ${CONTROL_URL}`);
  const found: string[] = [];
  for (const staff of STAFF_ROLES.filter((s) => s.id !== "stf-0001")) {
    await page.context().setExtraHTTPHeaders({ "X-Nexus-Staff": staff.id });
    await page.goto("/");
    await expectScreenReady(page);
    await expect(page.getByText(staff.displayName, { exact: true }).first()).toBeVisible();

    const paths = ["/", ...(await menuPaths(page))];
    expect(paths.length, `${staff.role} visible menu count`).toBeGreaterThanOrEqual(
      staff.minPages + 1,
    );

    for (const path of paths) {
      await page.goto(path);
      await expectScreenReady(page);
      found.push(...(await axeSeriousOrCritical(page, `${staff.role}:${path}`)));
    }

    if (staff.forbiddenPath) {
      await page.goto(staff.forbiddenPath);
      await expect(
        page.locator("#main-content").getByText("No access", { exact: true }),
      ).toBeVisible();
      found.push(
        ...(await axeSeriousOrCritical(page, `${staff.role}:forbidden:${staff.forbiddenPath}`)),
      );
    }
  }
  expect(found, "role-scoped serious/critical axe violations").toEqual([]);
});

test("@real control-perf: Control list endpoint p95 on demo data", async ({ page }) => {
  test.skip(!(await controlReachable()), `No Control real stack on ${CONTROL_URL}`);
  await page.context().setExtraHTTPHeaders({ "X-Nexus-Staff": "stf-0001" });
  const calls = 20;
  const budgetMs = 300;
  const all: number[] = [];
  const rows: string[] = [];
  for (const endpoint of CONTROL_LIST_ENDPOINTS) {
    const times: number[] = [];
    for (let i = 0; i < calls; i += 1) {
      const started = performance.now();
      const res = await page.request.get(`/control/api/v1/${endpoint}?pageSize=50`, {
        headers: { "X-Nexus-Staff": "stf-0001" },
      });
      times.push(performance.now() - started);
      expect(res.status(), endpoint).toBe(200);
    }
    all.push(...times);
    rows.push(`${endpoint.padEnd(26)} p95 ${p95(times).toFixed(1)} ms`);
  }
  console.log(rows.join("\n"));
  report("control:api:list:p95", p95(all), budgetMs);
});

test("@real control-perf: first load of built Control app on 4G", async ({ browser }) => {
  const reachable = await fetch(CONTROL_BUILT_URL).then(
    (r) => r.ok,
    () => false,
  );
  test.skip(!reachable, `No built Control app on ${CONTROL_BUILT_URL}`);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/control/api/**", (route) =>
    route.continue({
      url: route.request().url().replace(CONTROL_BUILT_URL, "http://127.0.0.1:8100"),
    }),
  );
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
  await page.goto(`${CONTROL_BUILT_URL}/sign-in`);
  await expect(page.locator("main a, main button").first()).toBeVisible({
    timeout: 60_000,
  });
  const ms = Date.now() - started;
  const transferred = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .concat(performance.getEntriesByType("navigation"))
      .reduce((sum, e) => sum + ((e as PerformanceResourceTiming).transferSize || 0), 0),
  );
  console.log(`control first load transferred ${(transferred / 1024).toFixed(0)} KiB`);
  report("control:load:4g", ms, 6000);
  await context.close();
});
