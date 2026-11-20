import { expect, test, type Page } from "@playwright/test";
import { ADMINS, TENANTS, expectScreenReady, openNav, setLocale, signInAs } from "./helpers";

/**
 * Pseudo-locale `en-XA` (~40 % longer, accented, wrapped in ⟦ ⟧; dev builds only) at 360px: the menu and the table
 * screens never push the page sideways. At this width `DataTable` shows rows as cards; wide content may scroll inside
 * its own container, never the page.
 */
async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.beforeEach(async ({ page }) => {
  await setLocale(page, TENANTS.littleSteps.id, "en-XA");
  await signInAs(page, TENANTS.littleSteps.id, ADMINS.littleSteps);
  await expect(page.locator("#main-content")).toContainText("⟦");
});

test("pseudo: the menu fits 360px", async ({ page }) => {
  const nav = await openNav(page);
  const fits = await nav.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      inside: box.left >= -1 && box.right <= window.innerWidth + 1,
      noScroll: el.scrollWidth <= el.clientWidth + 1,
    };
  });
  expect(fits).toEqual({ inside: true, noScroll: true });
  expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
});

for (const path of ["/access", "/privacy", "/sync", "/vault", "/plan"]) {
  test(`pseudo: ${path} tables do not overflow the page at 360px`, async ({ page }) => {
    await page.goto(path);
    await expectScreenReady(page);
    expect(await pageOverflow(page), `page scrolls sideways on ${path}`).toBeLessThanOrEqual(0);
  });
}
