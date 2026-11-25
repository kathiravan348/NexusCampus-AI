import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMINS, TENANTS, expectScreenReady, openNav, setLocale, signInAs } from "../helpers";

/**
 * User manual screenshots (docs/manual). Run with `pnpm --dir frontend manual`; it rebuilds
 * `docs/manual/USER-MANUAL.md` from what this spec captures.
 *
 * - "Every screen" is discovered from the menu and each screen's tabs, so a new module or tab appears in the
 *   manual on the next run without editing this file.
 * - "End-to-end examples" are scripted flows. To document a new feature end to end, add one `flow(...)` below:
 *   a title, one line of intro, and a `shot(...)` after each step.
 *
 * Demo mode only (sample data, no server): the pictures are the same on every machine.
 */
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/manual");
const SHOTS = path.join(OUT, "screens");
const PARTS = path.join(OUT, ".parts");

interface Entry {
  readonly file: string;
  readonly caption: string;
}
interface Part {
  readonly order: number;
  readonly section: "screens" | "flows";
  readonly title: string;
  readonly intro: string;
  readonly shots: Entry[];
}

function part(order: number, section: Part["section"], title: string, intro: string): Part {
  return { order, section, title, intro, shots: [] };
}

function save(p: Part) {
  const name = `${String(p.order).padStart(3, "0")}.json`;
  writeFileSync(path.join(PARTS, name), JSON.stringify(p, null, 2));
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Takes one screenshot into the part; `fullPage` for whole screens, viewport for steps. */
async function shot(page: Page, p: Part, caption: string, fullPage = false) {
  await page.waitForTimeout(300); // let toasts and transitions settle
  const file = `${String(p.order).padStart(3, "0")}-${String(p.shots.length + 1).padStart(2, "0")}-${slug(caption).slice(0, 48)}.png`;
  await page.screenshot({ path: path.join(SHOTS, file), fullPage, animations: "disabled" });
  p.shots.push({ file, caption });
}

async function asAdmin(page: Page, key: keyof typeof TENANTS, pathname = "/", locale?: string) {
  if (locale) await setLocale(page, TENANTS[key].id, locale);
  await signInAs(page, TENANTS[key].id, ADMINS[key], pathname);
  await expectScreenReady(page);
}

// ---------------------------------------------------------------------------------------------------------------
// 1. Getting started
// ---------------------------------------------------------------------------------------------------------------

test("getting started", async ({ page }) => {
  const p = part(
    1,
    "flows",
    "Getting started",
    "Sign in, find your way around, switch language and theme.",
  );
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(page, p, "Sign-in page: pick an institution and a role (demo)", true);
  await asAdmin(page, "littleSteps");
  await shot(page, p, "Home: one tile per module you can use");
  await openNav(page);
  await shot(page, p, "The menu lists only the modules your role and plan allow");
  await page.keyboard.press("Escape");
  await page.locator("html").evaluate(() => localStorage.setItem("nexus-theme", "dark"));
  await page.reload();
  await expectScreenReady(page);
  await shot(page, p, "Dark theme");
  await page.locator("html").evaluate(() => localStorage.setItem("nexus-theme", "light"));
  save(p);
});

test("languages", async ({ page }) => {
  const p = part(
    2,
    "flows",
    "Languages",
    "Each institution has a default language; people can switch.",
  );
  await signInAs(page, TENANTS.apex.id, ADMINS.apex);
  await expectScreenReady(page);
  await shot(page, p, "Apex Coaching opens in Tamil");
  await signInAs(page, TENANTS.riverside.id, ADMINS.riverside);
  await expectScreenReady(page);
  await shot(page, p, "Riverside School opens in Hindi");
  save(p);
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Every screen (discovered: new modules and tabs appear automatically)
// ---------------------------------------------------------------------------------------------------------------

test("every screen", async ({ page }) => {
  // Little Steps first; then Apex (in English) for any screen Little Steps' plan does not include, e.g. AI.
  const seen = new Set<string>();
  let index = 0;
  for (const [key, locale] of [
    ["littleSteps", undefined],
    ["apex", "en-IN"],
  ] as const) {
    await asAdmin(page, key, "/", locale);
    const nav = await openNav(page);
    const links = await nav
      .getByRole("link")
      .evaluateAll((as) =>
        as.map((a) => ({ href: a.getAttribute("href") ?? "", name: (a.textContent ?? "").trim() })),
      );
    await page.keyboard.press("Escape");
    for (const link of links.filter((l) => l.href && l.href !== "/" && !seen.has(l.href))) {
      seen.add(link.href);
      const p = part(100 + index++, "screens", link.name, "");
      await page.goto(link.href);
      await expectScreenReady(page);
      const tabs = page.getByRole("tab");
      const count = await tabs.count();
      if (count === 0) await shot(page, p, link.name, true);
      for (let i = 0; i < count; i += 1) {
        const tab = tabs.nth(i);
        const label = ((await tab.textContent()) ?? "").trim();
        await tab.click();
        await expectScreenReady(page);
        await shot(page, p, `${link.name} — ${label}`, true);
      }
      save(p);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 3. End-to-end examples
// ---------------------------------------------------------------------------------------------------------------

test("flow: invite a teacher", async ({ page }) => {
  const p = part(
    11,
    "flows",
    "Invite a new teacher",
    "Users & access → Invite user → fill in → Send invitation.",
  );
  await asAdmin(page, "littleSteps", "/access");
  await shot(page, p, "1. Open Users & access");
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Full name").fill("Kavya Nair");
  await dialog.getByLabel("Email").fill("kavya.nair@littlesteps.example.edu");
  await dialog.getByLabel("Role").selectOption({ label: "Teacher" });
  await dialog.getByLabel("Applies to").selectOption({ label: "Institution" });
  await dialog.getByLabel("Where").selectOption({ index: 1 });
  await shot(page, p, "2. Fill in name, email, role and where it applies");
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Invitation sent.").first()).toBeVisible();
  await shot(page, p, "3. Invitation sent: the person appears as Invited");
  save(p);
});

test("flow: brand colours", async ({ page }) => {
  const p = part(
    12,
    "flows",
    "Change the brand colour",
    "Theme studio → pick a colour → Save. Unreadable colours are refused.",
  );
  await asAdmin(page, "littleSteps", "/theme");
  await shot(page, p, "1. Open Theme studio");
  await page.locator("#token-light-brand-primary").fill("#9A1C14");
  await shot(page, p, "2. Change the brand colour; the preview updates");
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(page.getByRole("button", { name: /^Save/ }).first()).toBeDisabled();
  await shot(page, p, "3. Saved: every screen now uses the new colour");
  save(p);
});

test("flow: reword a label", async ({ page }) => {
  const p = part(
    13,
    "flows",
    "Change any wording",
    "Text & language studio → find the text → edit → Save.",
  );
  await asAdmin(page, "littleSteps", "/texts");
  await shot(page, p, "1. Open Text & language studio");
  await page
    .getByRole("row", { name: /common\.save/ })
    .getByRole("button")
    .first()
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("Store edits");
  await shot(page, p, "2. Type the new wording");
  await page.getByRole("dialog").getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/theme");
  await expectScreenReady(page);
  await shot(page, p, "3. The new wording shows everywhere (here: the Save button)");
  save(p);
});

test("flow: switch a module", async ({ page }) => {
  const p = part(
    14,
    "flows",
    "Switch a module off and on",
    "Plan & usage → flip the switch. The menu changes at once.",
  );
  await asAdmin(page, "littleSteps", "/plan");
  await shot(page, p, "1. Plan & usage lists every module in your plan");
  await page.getByRole("row", { name: /M10/ }).getByRole("switch").click();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Sync centre" })).toHaveCount(
    0,
  );
  await shot(page, p, "2. Sync centre switched off: it leaves the menu");
  await page.getByRole("row", { name: /M10/ }).getByRole("switch").click();
  save(p);
});

test("flow: activity log", async ({ page }) => {
  const p = part(
    15,
    "flows",
    "Check the activity log",
    "Audit & privacy → Check this page. A broken link would be flagged.",
  );
  await asAdmin(page, "littleSteps", "/privacy");
  await page.getByRole("button", { name: "Check this page" }).click();
  await expect(page.getByText(/linked and intact/)).toBeVisible();
  await shot(page, p, "1. Every change is listed; the check confirms nothing was altered");
  save(p);
});

test("flow: data request", async ({ page }) => {
  const p = part(
    16,
    "flows",
    "Handle a family’s data request",
    "Audit & privacy → Data requests → open → Start work → Mark completed.",
  );
  await asAdmin(page, "apex", "/privacy", "en-IN");
  await page.getByRole("tab", { name: "Data requests" }).click();
  await shot(page, p, "1. Data requests, with due dates");
  await page.getByRole("table").getByRole("row").nth(1).getByRole("button").first().click();
  await shot(page, p, "2. Open a request");
  const start = page.getByRole("button", { name: "Start work" });
  if ((await start.count()) > 0) {
    await start.first().click();
    await expect(page.getByText("Request updated.").first()).toBeVisible();
    await shot(page, p, "3. Started: the family can see it is in progress");
  }
  save(p);
});

test("flow: notifications", async ({ page }) => {
  const p = part(
    17,
    "flows",
    "Set quiet hours",
    "Notifications → Preferences → quiet hours → Save.",
  );
  await asAdmin(page, "littleSteps", "/notifications");
  await page.getByRole("tab", { name: /preferences/i }).click();
  await shot(page, p, "1. Choose channels and quiet hours");
  await page.getByRole("switch", { name: "Hold messages during quiet hours" }).click();
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText("Preferences saved.").first()).toBeVisible();
  await shot(page, p, "2. Saved");
  save(p);
});

test("flow: support access", async ({ page }) => {
  const p = part(
    18,
    "flows",
    "Approve support access",
    "Data vault & access → Approve (narrow it if you like) → it ends by itself.",
  );
  await asAdmin(page, "riverside", "/vault", "en-GB");
  await shot(page, p, "1. A pending request from Nexus support: who, why, what, how long");
  await page
    .getByRole("button", { name: /^Approve/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await shot(page, p, "2. Choose modules and hours, and confirm");
  await dialog
    .getByRole("checkbox", { name: /I understand Nexus support staff will see this data/ })
    .click();
  await dialog.getByRole("button", { name: "Approve access" }).click();
  await expect(page.getByText("Access approved.").first()).toBeVisible();
  await page.getByRole("tab", { name: "Grants" }).click();
  await shot(page, p, "3. The grant is active; Revoke now ends it early");
  save(p);
});

test("flow: lost device", async ({ page }) => {
  const p = part(19, "flows", "Wipe a lost device", "Sync centre → Devices → Revoke and wipe.");
  await asAdmin(page, "littleSteps", "/sync");
  await page.getByRole("tab", { name: "Devices", exact: true }).click();
  await shot(page, p, "1. Every signed-in device, with its last sync");
  await page.getByRole("button", { name: "Revoke and wipe Classroom tablet" }).click();
  await shot(page, p, "2. Confirm: the device is wiped the next time it connects");
  save(p);
});

test("flow: assist", async ({ page }) => {
  const p = part(
    20,
    "flows",
    "Ask Nexus Assist",
    "AI settings → Open Nexus Assist → ask. Answers show their sources.",
  );
  await asAdmin(page, "riverside", "/ai", "en-GB");
  await shot(page, p, "1. AI settings: on/off, which areas it may read");
  await page.getByRole("button", { name: "Open Nexus Assist" }).click();
  await page.getByLabel("Your question").fill("When does the autumn term end?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Sources").first()).toBeVisible();
  await shot(page, p, "2. The answer, marked AI-generated, with its sources");
  save(p);
});

test("flow: roles", async ({ page }) => {
  const p = part(
    21,
    "flows",
    "What each role sees",
    "The same app, trimmed to each person’s role.",
  );
  await signInAs(page, TENANTS.littleSteps.id, "usr-ls-arjun");
  await expectScreenReady(page);
  await shot(page, p, "Teacher: fewer modules, children’s private details hidden");
  await signInAs(page, TENANTS.littleSteps.id, "usr-ls-sunita");
  await expectScreenReady(page);
  await shot(page, p, "Parent: only their own family");
  save(p);
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Stage 3 — core institution operations (one example per day-to-day job)
// ---------------------------------------------------------------------------------------------------------------

async function as(
  page: Page,
  key: keyof typeof TENANTS,
  user: string,
  pathname: string,
  locale?: string,
) {
  if (locale) await setLocale(page, TENANTS[key].id, locale);
  await signInAs(page, TENANTS[key].id, user, pathname);
  await expectScreenReady(page);
}

const main = (page: Page) => page.locator("#main-content");

test("flow: stage 3 take attendance", async ({ page }) => {
  const p = part(
    22,
    "flows",
    "Take attendance",
    "Attendance → class group → today's session → mark each learner → Save. Works offline too.",
  );
  await as(page, "littleSteps", "usr-ls-arjun", "/attendance");
  await main(page).getByRole("combobox").first().selectOption({ index: 1 });
  await expect(main(page).getByText("Open", { exact: true }).first()).toBeVisible();
  await shot(page, p, "1. Choose the class group: its sessions are listed by date");
  await main(page).getByRole("button").filter({ hasText: "Open" }).first().click();
  await expect(page.getByRole("button", { name: "Mark all present" })).toBeVisible();
  await shot(page, p, "2. Open today's session: one row per learner");
  await page.getByRole("button", { name: "Late" }).first().click();
  await page.getByRole("spinbutton", { name: "Minutes late" }).first().fill("10");
  await shot(page, p, "3. Mark a learner Late and enter the minutes");
  await page.getByRole("button", { name: "Save" }).first().click();
  await shot(page, p, "4. Saved (offline, it waits and syncs when you reconnect)");
  save(p);
});

test("flow: stage 3 fees", async ({ page }) => {
  const p = part(
    23,
    "flows",
    "Check an invoice and record a payment",
    "Fees → Invoices → Show lines → Payments → Record payment.",
  );
  await as(page, "riverside", ADMINS.riverside, "/fees", "en-GB");
  await shot(page, p, "1. Invoices with total, paid and balance");
  await page.getByRole("button", { name: "Show lines" }).first().click();
  await shot(page, p, "2. Show lines: what the invoice is made of");
  await page.getByRole("tab", { name: "Payments" }).click();
  await expectScreenReady(page);
  await shot(page, p, "3. Payments: every receipt");
  await page.getByRole("button", { name: "Record payment" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, p, "4. Record payment shows the remaining balance before you save");
  await page.keyboard.press("Escape");
  save(p);
});

test("flow: stage 3 marks", async ({ page }) => {
  const p = part(
    24,
    "flows",
    "Enter marks",
    "Gradebook → class group → assessment → type the marks. The percentage updates as you type.",
  );
  await as(page, "riverside", "usr-rv-tom", "/gradebook", "en-GB");
  // The first class group whose assessment is still being marked (published ones are read-only).
  const group = main(page).getByRole("combobox").first();
  const marking = main(page)
    .getByRole("listitem")
    .getByRole("button")
    .filter({ hasText: "Marking" });
  const options = await group.locator("option").count();
  for (let i = 1; i < options && (await marking.count()) === 0; i += 1) {
    await group.selectOption({ index: i });
    await expectScreenReady(page);
    await page.waitForTimeout(300);
  }
  await expect(marking.first()).toBeVisible();
  await shot(page, p, "1. Choose the class group: its assessments, maximum marks and weight");
  await marking.first().click();
  await expect(page.getByRole("spinbutton", { name: "Marks" }).first()).toBeVisible();
  await shot(page, p, "2. Open an assessment: the mark sheet");
  const open = page.getByRole("spinbutton", { name: "Marks" }).and(page.locator(":enabled"));
  if ((await open.count()) === 0)
    await page.getByRole("checkbox", { name: "Absent" }).first().click();
  await open.first().fill("42");
  await shot(page, p, "3. Type a mark: the percentage follows");
  save(p);
});

test("flow: stage 3 enquiry", async ({ page }) => {
  const p = part(
    25,
    "flows",
    "Add an admissions enquiry",
    "Admissions → Enquiries → Add enquiry → fill in → Save. It appears as New.",
  );
  await as(page, "apex", ADMINS.apex, "/admissions", "en-IN");
  await shot(page, p, "1. Enquiries, filtered by status");
  await page.getByRole("button", { name: "Add enquiry" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Learner name").fill("Divya Raman");
  await dialog.getByLabel("Contact name").fill("Raman Krishnan");
  await dialog.getByLabel("Contact phone").fill("+919876500000");
  await shot(page, p, "2. Fill in the learner and the contact (sample names)");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await shot(page, p, "3. Saved: the enquiry is listed as New");
  save(p);
});

test("flow: stage 3 portals", async ({ page }) => {
  const p = part(
    26,
    "flows",
    "Portals: family, learner, teacher",
    "Each person gets their own home page, trimmed to their own records.",
  );
  await as(page, "riverside", "usr-rv-grace", "/family", "en-GB");
  await shot(page, p, "Family: the child's attendance, fees, marks and messages at a glance");
  await as(page, "riverside", "usr-rv-oliver", "/learner", "en-GB");
  await shot(page, p, "Learner: today's classes, results and messages");
  await as(page, "riverside", "usr-rv-tom", "/staff", "en-GB");
  await shot(page, p, "Teacher: today's registers, pending leave and quick links");
  save(p);
});

test("flow: stage 3 dashboards", async ({ page }) => {
  const p = part(
    27,
    "flows",
    "Key metrics for leaders",
    "Home → Key metrics → Dashboards. Each figure shows when it was last updated.",
  );
  await as(page, "riverside", ADMINS.riverside, "/dashboards", "en-GB");
  await shot(
    page,
    p,
    "Attendance, fees and marks for the whole group, each with its As of time",
    true,
  );
  save(p);
});
