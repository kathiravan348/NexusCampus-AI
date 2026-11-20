import { expect, test, type Page } from "@playwright/test";
import { ADMINS, TENANTS, expectScreenReady, openNav, rawKeys, signInAs } from "./helpers";

/**
 * Default languages English, Hindi, Tamil (D42): Riverside opens in Hindi and Apex Coaching in Tamil, every screen
 * shows that script with no raw keys, the menu stays on the start (left) side, and the language picker switches to
 * English and back.
 */
const CASES = [
  {
    key: "riverside",
    locale: "hi-IN",
    english: "en-GB",
    script: /[ऀ-ॿ]/,
    home: "स्वागत है",
  },
  {
    key: "apex",
    locale: "ta-IN",
    english: "en-IN",
    script: /[஀-௿]/,
    home: "வரவேற்கிறோம்",
  },
] as const;

/** The language picker at the bottom of the menu (found by its English option, so it works in any language). */
const picker = (page: Page, english: string) =>
  page.locator(`select:has(option[value="${english}"])`).filter({ visible: true }).first();

for (const c of CASES) {
  const tenant = TENANTS[c.key];
  test(`languages: ${tenant.name} opens in ${c.locale} and switches to English and back`, async ({
    page,
  }, testInfo) => {
    await signInAs(page, tenant.id, ADMINS[c.key]);
    await expect(page.locator("html")).toHaveAttribute("lang", c.locale);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("#main-content h1").first()).toContainText(c.home);

    const nav = await openNav(page);
    const box = await nav.boundingBox();
    expect(box, "menu is laid out").not.toBeNull();
    expect(Math.round(box?.x ?? -1)).toBeLessThanOrEqual(2); // inline-start in LTR is the left edge
    await page.keyboard.press("Escape");

    for (const path of ["/", "/access", "/notifications"]) {
      await page.goto(path);
      await expectScreenReady(page);
      expect(await rawKeys(page), `raw message keys on ${path}`).toEqual([]);
      await expect(page.locator("#main-content h1").first()).toHaveText(c.script);
      const name = path === "/" ? "home" : path.slice(1);
      await testInfo.attach(`${c.locale}-${name}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }

    await page.goto("/");
    await expectScreenReady(page);
    await openNav(page);
    await picker(page, c.english).selectOption(c.english);
    await expect(page.locator("html")).toHaveAttribute("lang", c.english);
    await page.keyboard.press("Escape"); // close the phone menu drawer
    await expect(page.locator("#main-content h1").first()).toContainText("Welcome");

    await openNav(page);
    await picker(page, c.english).selectOption(c.locale);
    await expect(page.locator("html")).toHaveAttribute("lang", c.locale);
    await page.keyboard.press("Escape");
    await expect(page.locator("#main-content h1").first()).toContainText(c.home);
  });
}
