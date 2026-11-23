import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Nexus Control screenshots for the user manual (NEX-099): the sign-in page, home, and every page in the super
 * admin's menu (discovered from the menu, so new pages appear by themselves), plus one AI-draft example.
 * Served from the Control mock review build (see `playwright.config.ts`).
 */
const CONTROL = "http://127.0.0.1:4314";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/manual");

interface Part {
  readonly order: number;
  readonly section: "control";
  readonly title: string;
  readonly intro: string;
  readonly shots: { file: string; caption: string }[];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function part(order: number, title: string, intro: string): Part {
  return { order, section: "control", title, intro, shots: [] };
}

function save(p: Part) {
  writeFileSync(path.join(OUT, ".parts", `${p.order}.json`), JSON.stringify(p, null, 2));
}

async function shot(page: Page, p: Part, caption: string, fullPage = false) {
  await page.waitForTimeout(300);
  const file = `${p.order}-${String(p.shots.length + 1).padStart(2, "0")}-${slug(caption).slice(0, 48)}.png`;
  await page.screenshot({
    path: path.join(OUT, "screens", file),
    fullPage,
    animations: "disabled",
  });
  p.shots.push({ file, caption });
}

async function ready(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Loading/ })).toHaveCount(0);
}

async function signIn(page: Page, name: string) {
  await page.goto(`${CONTROL}/sign-in`);
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await ready(page);
}

test("control: getting started", async ({ page }) => {
  const p = part(
    500,
    "Nexus Control — getting started",
    "Our own provider app. Pick a demo staff member; each role sees only its pages. No page shows institution data. On the real backend, staff sign in with their work account and a one-time code.",
  );
  await page.goto(`${CONTROL}/sign-in`);
  await expect(page.getByRole("button", { name: /Sign in as/ }).first()).toBeVisible();
  await shot(page, p, "Sign-in page: one demo staff member per role");
  await signIn(page, "Nisha Verma");
  await shot(page, p, "Home: one tile per page the role may open");
  save(p);
});

/** One plain-language line per page (menu name in English), as in docs/guides/CONTROL-GUIDE.md. */
const INTROS: Readonly<Record<string, string>> = {
  Accounts:
    "Every customer: contacts, contracts, notes and health, and the opportunities in progress.",
  "Pricing & quotes":
    "The price list per learner and add-ons, and quotes that are drafted, sent and accepted.",
  Billing:
    "Subscriptions, invoices, payments and reminders. Indian invoices get a Razorpay payment link; European invoices are paid by bank transfer for now.",
  Provisioning:
    "Start a new institution in its region, and offboard one that leaves: frozen, exported for its own key, keys destroyed after two staff approve, with a signed certificate.",
  Licences: "Signed licence files for institutions that run NexusCampus on their own servers.",
  Fleet:
    "Every cloud cell and own-server install, with its version and health (counts and timings only).",
  Releases:
    "New versions: a release is published only with a signed manifest, then rolled out ring by ring.",
  Extensions: "Customer-specific extensions and whether each one works with the next release.",
  Support: "Tickets, replies and response times, plus the help articles.",
  "Access requests":
    "Ask an institution for time-limited access to help it. The institution decides in its own app; we never approve ourselves.",
  Usage: "Learners, campuses and AI credits used against each plan.",
  Partners: "Resellers, their registered deals and commissions.",
  Staff: "Our staff, their roles and two-step sign-in status.",
  Trust: "Sub-processors, certifications, security incidents and data-processing agreements.",
  Projects: "Implementation projects for new customers, from kick-off to go-live.",
  Analytics: "Revenue, growth, churn and support load per month.",
  Sandboxes: "Demo, trial and staging environments, always with sample data and an expiry date.",
  Moves:
    "Move an institution to another region, to its own servers or back to the cloud, in seven checked steps.",
};

test("control: every page", async ({ page }) => {
  await signIn(page, "Nisha Verma");
  const links = await page
    .locator("aside nav")
    .getByRole("link")
    .evaluateAll((as) =>
      as.map((a) => ({ href: a.getAttribute("href") ?? "", name: (a.textContent ?? "").trim() })),
    );
  let order = 510;
  for (const link of links.filter((l) => l.href && l.href !== "/")) {
    const p = part(order++, `Nexus Control — ${link.name}`, INTROS[link.name] ?? "");
    await page.goto(`${CONTROL}${link.href}`);
    await ready(page);
    const tabs = page.getByRole("tab");
    const count = await tabs.count();
    if (count === 0) await shot(page, p, link.name, true);
    for (let i = 0; i < count; i += 1) {
      const tab = tabs.nth(i);
      const label = ((await tab.textContent()) ?? "").trim();
      await tab.click();
      await ready(page);
      await shot(page, p, `${link.name} — ${label}`, true);
    }
    save(p);
  }
  expect(order - 510).toBeGreaterThanOrEqual(18);
});
