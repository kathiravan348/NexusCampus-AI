import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * "Platform & tools" part of the user manual: Storybook (always), and — when the dev stack runs — the real app
 * signed in through the sign-in service, the sign-in service's admin console, the key vault and the API of the dev
 * cell. A section whose service is not running is skipped and listed as "not captured" in the manual.
 *
 * Start the dev stack first for the full manual (see docs/manual/USER-MANUAL.md, "Keeping this manual up to date").
 * Local dev passwords are read from backend/.env (dev-only values, never printed).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../../docs/manual");
const SHOTS = path.join(OUT, "screens");
const PARTS = path.join(OUT, ".parts");

const STORYBOOK = "http://127.0.0.1:4313";
const APP = process.env["NEXUS_MANUAL_REAL_URL"] ?? "http://127.0.0.1:3100";
const API = "http://127.0.0.1:8000";
const KEYCLOAK = "http://127.0.0.1:58080";
const VAULT = "http://127.0.0.1:58200";

function env(): Record<string, string> {
  const file = path.resolve(HERE, "../../../backend/.env");
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}
const ENV = env();

interface Part {
  readonly order: number;
  readonly section: "platform";
  readonly title: string;
  readonly intro: string;
  readonly how: string;
  readonly skipped?: string;
  readonly shots: { file: string; caption: string }[];
}

const part = (order: number, title: string, intro: string, how: string): Part => ({
  order,
  section: "platform",
  title,
  intro,
  how,
  shots: [],
});

function save(p: Part) {
  writeFileSync(
    path.join(PARTS, `${String(p.order).padStart(3, "0")}.json`),
    JSON.stringify(p, null, 2),
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function shot(page: Page, p: Part, caption: string, fullPage = false) {
  await page.waitForTimeout(400);
  const file = `${String(p.order).padStart(3, "0")}-${String(p.shots.length + 1).padStart(2, "0")}-${slug(caption).slice(0, 48)}.png`;
  await page.screenshot({ path: path.join(SHOTS, file), fullPage, animations: "disabled" });
  p.shots.push({ file, caption });
}

async function up(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Saves a part that could not be captured, so the manual says so instead of silently dropping it. */
function skipped(p: Part, reason: string) {
  save({ ...p, skipped: reason });
}

// ---------------------------------------------------------------------------------------------------------------

test("platform: storybook", async ({ page }) => {
  const p = part(
    200,
    "Component library (Storybook)",
    "Every building block of the screens, with its states. Open it to browse the components.",
    "http://127.0.0.1:6006 (start it with `pnpm --dir frontend/packages/ui-storybook dev`)",
  );
  await page.goto(`${STORYBOOK}/`);
  await expect(page.locator("#storybook-preview-iframe")).toBeVisible();
  await page.frameLocator("#storybook-preview-iframe").locator("#storybook-root").waitFor();
  await shot(page, p, "Storybook: components on the left, the selected one on the right");
  save(p);
});

test("platform: real app on the dev cell", async ({ page }) => {
  const p = part(
    210,
    "The app on the real server (dev cell)",
    "Same screens as the demo, but on the real server and database. People sign in through the sign-in service.",
    "`uv run --project backend nexus-compose-up`, `nexus-dev`, then `pnpm --dir frontend dev:real` → http://127.0.0.1:3100",
  );
  if (!(await up(`${API}/healthz`)) || !(await up(APP)) || !ENV["NEXUS_DEMO_USER_PASSWORD"])
    return skipped(p, "the dev cell (backend and `dev:real`) was not running");
  await page.goto(`${APP}/setup`);
  await expect(
    page.getByRole("button", { name: "Sign in with your institution account" }),
  ).toBeVisible();
  await shot(page, p, "1. Sign-in page of a real installation");
  await page.getByRole("button", { name: "Sign in with your institution account" }).click();
  await page.locator("#username").fill("priya.raman@littlesteps.example.edu");
  if (!(await page.locator("#password").isVisible())) await page.locator("#kc-login").click();
  await shot(page, p, "2. The sign-in service asks for the password (or the school’s own login)");
  await page.locator("#password").fill(ENV["NEXUS_DEMO_USER_PASSWORD"]);
  await page.locator("#kc-login").click();
  await expect(page.locator("#main-content h1").first()).toBeVisible();
  await page.goto(`${APP}/`);
  await expect(page.locator("#main-content h1").first()).toBeVisible();
  await shot(page, p, "3. Signed in: no demo banner, real data");
  save(p);
});

test("platform: sign-in service admin", async ({ page }) => {
  const p = part(
    220,
    "Sign-in service (Keycloak)",
    "Holds passwords, single sign-on and multi-factor login. Each institution is an organisation.",
    `Admin console → ${KEYCLOAK}/admin (user \`admin\`, password \`NEXUS_KEYCLOAK_ADMIN_PASSWORD\` in backend/.env)`,
  );
  if (!(await up(`${KEYCLOAK}/realms/nexus-dev`)) || !ENV["NEXUS_KEYCLOAK_ADMIN_PASSWORD"])
    return skipped(p, "the sign-in service was not running");
  await page.goto(`${KEYCLOAK}/admin/master/console/`);
  await page.locator("#username").fill("admin");
  if (!(await page.locator("#password").isVisible())) await page.locator("#kc-login").click();
  await page.locator("#password").fill(ENV["NEXUS_KEYCLOAK_ADMIN_PASSWORD"]);
  await page.locator("#kc-login").click();
  await expect(page.getByRole("link", { name: "Manage realms" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Manage realms" }).click();
  await page.getByRole("link", { name: "nexus-dev", exact: true }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await shot(page, p, "1. The dev cell realm (nexus-dev; an own-server install uses nexus)");
  for (const [link, caption] of [
    ["Organizations", "2. Organisations: one per institution"],
    ["Users", "3. Users: the people who can sign in"],
    ["Clients", "4. Clients: the NexusCampus app"],
    ["Authentication", "5. Login flows (password, single sign-on, multi-factor)"],
  ] as const) {
    const item = page.getByRole("navigation").getByRole("link", { name: link, exact: true });
    if ((await item.count()) === 0) continue;
    await item.first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await shot(page, p, caption);
  }
  save(p);
});

test("platform: key vault", async ({ page }) => {
  const p = part(
    230,
    "Key management (OpenBao)",
    "Every institution’s encryption keys live here, never in the database. The app’s Data vault screen shows their status only.",
    `${VAULT}/ui → method Token, token \`NEXUS_VAULT_TOKEN\` in backend/.env (dev only)`,
  );
  if (!(await up(`${VAULT}/v1/sys/health`)) || !ENV["NEXUS_VAULT_TOKEN"])
    return skipped(p, "the key vault was not running");
  await page.goto(`${VAULT}/ui/vault/auth?with=token`);
  await shot(page, p, "1. Sign in to the key vault");
  await page.locator("input[type=password]").first().fill(ENV["NEXUS_VAULT_TOKEN"]);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/ui\/vault\/dashboard/);
  // The vault UI keeps its sign-in only inside the page: move by clicking, never by reloading.
  await page
    .getByRole("link", { name: /^Secrets engines$/i })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await shot(page, p, "2. Secrets engines: “transit” holds the encryption keys");
  await page
    .getByRole("link", { name: /transit\// })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await shot(page, p, "3. One key per institution and purpose, plus the audit-signing key");
  await page.getByRole("link", { name: "tenant-ten-ls-tenant-data" }).first().click();
  await page.waitForLoadState("networkidle");
  await shot(
    page,
    p,
    "4. A key’s details: type and versions; the key itself never leaves the vault",
  );
  save(p);
});

test("platform: api", async ({ page }) => {
  const p = part(
    240,
    "Backend API (dev cell)",
    "What the app talks to. Developers and integrators read every endpoint here.",
    `${API}/docs (interactive) · ${API}/healthz · ${API}/readyz`,
  );
  if (!(await up(`${API}/healthz`))) return skipped(p, "the backend was not running");
  await page.goto(`${API}/docs`);
  await page.locator(".swagger-ui").waitFor();
  await page.waitForTimeout(800);
  await shot(page, p, "1. Interactive API reference, grouped by module");
  const op = page.locator(".opblock-summary-path", { hasText: "/api/v1/people" }).first();
  if ((await op.count()) > 0) {
    await op.click();
    await page.waitForTimeout(500);
    await shot(page, p, "2. One endpoint: its inputs, outputs and errors");
  }
  await page.goto(`${API}/readyz`);
  await shot(page, p, "3. Health check: the database and cache answer");
  save(p);
});
