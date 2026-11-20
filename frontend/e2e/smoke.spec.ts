import { expect, test } from "@playwright/test";
import {
  ADMINS,
  TENANTS,
  demoBanner,
  expectScreenReady,
  menuPaths,
  rawKeys,
  signInAs,
  watchErrors,
} from "./helpers";

/** Every demo tenant's admin opens every screen in their menu: heading, demo banner, no errors, no raw keys. */
for (const key of Object.keys(TENANTS) as (keyof typeof TENANTS)[]) {
  const tenant = TENANTS[key];
  test(`smoke: ${tenant.name} admin opens every menu screen`, async ({ page }) => {
    const errors = watchErrors(page);
    await signInAs(page, tenant.id, ADMINS[key]);
    await expect(demoBanner(page)).toBeVisible();

    const paths = await menuPaths(page);
    expect(paths.length).toBeGreaterThan(5);
    for (const path of paths) {
      await test.step(path, async () => {
        await page.goto(path);
        await expectScreenReady(page);
        await expect(demoBanner(page)).toBeVisible();
        expect(await rawKeys(page), `raw message keys on ${path}`).toEqual([]);
      });
    }
    expect(errors, "console errors").toEqual([]);
  });
}
