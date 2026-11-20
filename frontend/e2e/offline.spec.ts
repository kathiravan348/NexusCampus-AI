import { expect, test, type Page } from "@playwright/test";
import { ADMINS, TENANTS, expectScreenReady, signInAs } from "./helpers";

/**
 * Offline (O-1–O-3) on the mock production build: the PWA worker serves the shell, an L1 screen shows cached data,
 * an L0 screen explains it needs a connection, a queued write blocks sign-out, and reconnecting syncs it (the header
 * then shows "Last synced") so sign-out goes through.
 */
async function waitForWorker(page: Page) {
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });
}

const visibleText = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

test("offline: shell, cached L1 data, L0 notice, queued write, sync on reconnect", async ({
  page,
  context,
}) => {
  // Online first: the worker installs and the L1 caches (users, my preferences) fill.
  await signInAs(page, TENANTS.littleSteps.id, ADMINS.littleSteps, "/access");
  await expectScreenReady(page);
  await waitForWorker(page);
  await expect(visibleText(page, "Priya Raman")).toBeVisible();
  await page.goto("/notifications");
  await expectScreenReady(page);
  await page.getByRole("tab", { name: "My preferences" }).click();
  await expect(page.getByRole("switch").first()).toBeVisible();
  await page.waitForTimeout(1_500); // the persisted query cache writes on a short throttle

  await context.setOffline(true);

  await test.step("shell and L1 screen from cache", async () => {
    await page.goto("/access");
    await expectScreenReady(page);
    await expect(visibleText(page, /^Offline/)).toBeVisible();
    await expect(page.getByText("You are offline. You can look at cached users")).toBeVisible();
    await expect(visibleText(page, "Priya Raman")).toBeVisible();
  });

  await test.step("L0 screen shows the offline notice", async () => {
    await page.goto("/setup");
    await expect(page.getByText("Needs a connection")).toBeVisible();
  });

  await test.step("a queued write blocks sign-out", async () => {
    await page.goto("/notifications");
    await expectScreenReady(page);
    await page.getByRole("tab", { name: "My preferences" }).click();
    await page.getByRole("switch", { name: "Hold messages during quiet hours" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("Saved on this device. It will sync when you are back online.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(visibleText(page, /^Offline · 1 pending/)).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(visibleText(page, /still waiting to sync/)).toBeVisible();
    await expect(page.getByRole("tab", { name: "My preferences" })).toBeVisible();
  });

  await test.step("reconnect syncs the write, then sign-out works", async () => {
    await context.setOffline(false);
    await expect(visibleText(page, /Last synced/)).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to a demo institution" }),
    ).toBeVisible();
  });
});
