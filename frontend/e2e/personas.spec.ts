import { expect, test } from "@playwright/test";
import {
  PERSONAS,
  TENANTS,
  demoBanner,
  expectScreenReady,
  menuPaths,
  rawKeys,
  signInAs,
  watchErrors,
} from "./helpers";

for (const [tenantKey, role, userId] of PERSONAS) {
  const tenant = TENANTS[tenantKey];
  test(`${tenant.name} ${role}`, async ({ page }) => {
    const errors = watchErrors(page);
    await signInAs(page, tenant.id, userId);
    await expectScreenReady(page);
    await expect(demoBanner(page)).toBeVisible();
    expect(await rawKeys(page), "raw message keys on home").toEqual([]);

    const paths = await menuPaths(page);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      await test.step(path, async () => {
        await page.goto(path);
        await expectScreenReady(page);
        await expect(page).toHaveURL((url) => url.pathname === path);
        await expect(demoBanner(page)).toBeVisible();
        expect(await rawKeys(page), `raw message keys on ${path}`).toEqual([]);
      });
    }
    expect(errors, "console errors").toEqual([]);
  });
}
