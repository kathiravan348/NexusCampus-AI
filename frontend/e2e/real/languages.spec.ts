import { expect, test, type Page } from "@playwright/test";
import { expectScreenReady, menuPaths, openNav, rawKeys } from "../helpers";
import { ADMIN_EMAIL, MISSING_CREDENTIALS, SKIP_REASON, TAMIL_EMAIL, realSignIn } from "./helpers";

test.skip(MISSING_CREDENTIALS, SKIP_REASON);

/**
 * Default languages on real data (D42, NEX-065): Apex opens in Tamil from its institution settings; Little Steps
 * turns Hindi on, switches to it and back, and turns it off again. Every menu screen shows the script with no raw
 * keys. (A native speaker still reviews the wording: Owner item in docs/review/STAGE-1-RELEASE.md.)
 */
const picker = (page: Page, english: string) =>
  page.locator(`select:has(option[value="${english}"])`).filter({ visible: true }).first();

async function everyScreenIn(page: Page, script: RegExp) {
  const problems: string[] = [];
  for (const path of ["/", ...(await menuPaths(page))]) {
    await page.goto(path);
    await expectScreenReady(page);
    const keys = await rawKeys(page);
    if (keys.length) problems.push(`${path}: raw keys ${keys.join(", ")}`);
    const heading = (await page.locator("#main-content h1").first().textContent()) ?? "";
    if (!script.test(heading)) problems.push(`${path}: heading not translated: ${heading}`);
  }
  expect(problems).toEqual([]);
}

test("@real languages: Apex opens in Tamil on every screen", async ({ page }) => {
  await realSignIn(page, TAMIL_EMAIL);
  await expect(page.locator("html")).toHaveAttribute("lang", "ta-IN");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await everyScreenIn(page, /[஀-௿]/);
});

test("@real languages: Little Steps switches to Hindi and back", async ({ page }) => {
  await realSignIn(page, ADMIN_EMAIL, "/setup");
  await page.getByRole("tab", { name: "Locale & formats" }).click();
  const hindi = page.getByRole("checkbox", { name: "Hindi (India) (hi-IN)" });
  const wasOn = (await hindi.getAttribute("aria-checked")) === "true";
  if (!wasOn) {
    await hindi.click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();
  }
  try {
    await page.goto("/");
    await expectScreenReady(page);
    await openNav(page);
    await picker(page, "en-IN").selectOption("hi-IN");
    await expect(page.locator("html")).toHaveAttribute("lang", "hi-IN");
    await page.keyboard.press("Escape");
    await everyScreenIn(page, /[ऀ-ॿ]/);
    await page.goto("/");
    await openNav(page);
    await picker(page, "en-IN").selectOption("en-IN");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-IN");
    await page.keyboard.press("Escape");
  } finally {
    if (!wasOn) {
      // Put it back, so the run can be repeated.
      await page.goto("/setup");
      await page.getByRole("tab", { name: "Locale & formats" }).click();
      await page.getByRole("checkbox", { name: "Hindi (India) (hi-IN)" }).click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();
    }
  }
});
