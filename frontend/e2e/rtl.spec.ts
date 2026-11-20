import { expect, test } from "@playwright/test";
import { ADMINS, TENANTS, expectScreenReady, openNav, rawKeys, signInAs } from "./helpers";

/** Apex Coaching runs in Arabic (`ar-AE`): right-to-left document, menu on the inline-start (right) side. */
test("rtl: Apex Coaching in ar-AE is right-to-left with the menu on the start side", async ({
  page,
}, testInfo) => {
  await signInAs(page, TENANTS.apex.id, ADMINS.apex);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", /^ar/);

  const nav = await openNav(page);
  const box = await nav.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box, "menu is laid out").not.toBeNull();
  // Inline-start in RTL is the right edge: the menu hugs it, whether sidebar or drawer.
  expect(Math.round((box?.x ?? 0) + (box?.width ?? 0))).toBeGreaterThanOrEqual(width - 2);
  expect(box?.x ?? 0).toBeGreaterThan(width / 4);
  await page.keyboard.press("Escape");

  for (const path of ["/", "/access", "/notifications"]) {
    await page.goto(path);
    await expectScreenReady(page);
    expect(await rawKeys(page), `raw message keys on ${path}`).toEqual([]);
    const name = path === "/" ? "home" : path.slice(1);
    await testInfo.attach(`rtl-${name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
});
