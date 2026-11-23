import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectScreenReady, menuPaths, openNav } from "../helpers";

/**
 * Default languages (en, hi, ta — D42, D53) on real data in Nexus Control (NEX-137):
 * Visits every Control page (`/`, P01–P18, plus account detail) in English, Hindi, and Tamil against the real
 * Control backend. Verifies `<html lang>`, script rendering on every heading, and zero missing or raw keys on screen.
 */
const CONTROL_URL = process.env["NEXUS_CONTROL_E2E_URL"] ?? "http://127.0.0.1:3200";
const SYSTEM_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

test.use({
  baseURL: CONTROL_URL,
  ...(fs.existsSync(SYSTEM_CHROME) ? { channel: "chrome" } : {}),
});

async function controlReachable(): Promise<boolean> {
  return fetch(`${CONTROL_URL}/control/api/v1/health`).then(
    (r) => r.ok,
    () => false,
  );
}

/**
 * Finds any text node on screen that looks like an untranslated Control/shared message key
 * (`p01.*`..`p18.*`, `ctl.*`, `common.*`, `m04.*`, `term.*`) or unresolved `[missing` marker outside `code`/`.font-mono`.
 */
async function controlRawKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const keyRe = /^(p\d{2}|ctl|common|m\d{2}|term)\.[a-zA-Z0-9_.]+$/;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      if (!text) continue;
      const technical = node.parentElement?.closest("code, .font-mono") != null;
      if (!technical && (keyRe.test(text) || text.includes("[missing"))) {
        out.push(text);
      }
    }
    return out;
  });
}

async function selectControlLocale(page: Page, locale: "en" | "hi" | "ta") {
  await openNav(page);
  const select = page
    .locator('select:has(option[value="en"]):has(option[value="hi"]):has(option[value="ta"])')
    .filter({ visible: true })
    .first();
  await select.selectOption(locale);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.keyboard.press("Escape");
}

async function verifyEveryControlScreenIn(
  page: Page,
  paths: readonly string[],
  locale: "en" | "hi" | "ta",
  script: RegExp,
) {
  const problems: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await expectScreenReady(page);
    const keys = await controlRawKeys(page);
    if (keys.length) problems.push(`${locale} ${path}: raw keys ${keys.join(", ")}`);
    const heading = ((await page.locator("#main-content h1").first().textContent()) ?? "").trim();
    // `/accounts/acc-ls` heading is the tenant/account name ("Little Steps Playschool"), while module pages translate h1.
    if (path !== "/accounts/acc-ls" && !script.test(heading)) {
      problems.push(`${locale} ${path}: heading not in expected script: "${heading}"`);
    }
  }
  expect(problems, `language issues for ${locale}`).toEqual([]);
}

test("@real control-languages: every Control screen renders cleanly in en, hi, and ta on real data", async ({
  page,
}) => {
  test.skip(!(await controlReachable()), `No Control real stack on ${CONTROL_URL}`);
  await page.context().setExtraHTTPHeaders({ "X-Nexus-Staff": "stf-0001" });
  await page.goto("/");
  await expectScreenReady(page);

  const paths = ["/", ...(await menuPaths(page)), "/accounts/acc-ls"];
  expect(paths.length).toBeGreaterThanOrEqual(20);

  // 1. English (en)
  await selectControlLocale(page, "en");
  await verifyEveryControlScreenIn(page, paths, "en", /[A-Za-z]/);

  // 2. Hindi (hi — Devanagari)
  await page.goto("/");
  await expectScreenReady(page);
  await selectControlLocale(page, "hi");
  await verifyEveryControlScreenIn(page, paths, "hi", /[\u0900-\u097F]/);

  // 3. Tamil (ta — Tamil script)
  await page.goto("/");
  await expectScreenReady(page);
  await selectControlLocale(page, "ta");
  await verifyEveryControlScreenIn(page, paths, "ta", /[\u0B80-\u0BFF]/);

  // Restore English
  await page.goto("/");
  await expectScreenReady(page);
  await selectControlLocale(page, "en");
});
