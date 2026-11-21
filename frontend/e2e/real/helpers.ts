import { expect, type Page } from "@playwright/test";

/** Seeded demo password and admin (never committed; from `backend/.env` → `NEXUS_DEMO_USER_PASSWORD`). */
export const PASSWORD = process.env["NEXUS_E2E_PASSWORD"] ?? "";
export const ADMIN_EMAIL = process.env["NEXUS_E2E_EMAIL"] ?? "";
/** Apex Coaching's owner (Tamil, ta-IN default); same demo password. */
export const TAMIL_EMAIL = process.env["NEXUS_E2E_TA_EMAIL"] ?? "karthik@apex.example.edu";
export const MISSING_CREDENTIALS = !ADMIN_EMAIL || !PASSWORD;
export const SKIP_REASON = "Set NEXUS_E2E_EMAIL and NEXUS_E2E_PASSWORD (a seeded admin) to run";

/** Signs in through the real Keycloak login page and lands on `path`. */
export async function realSignIn(page: Page, email: string, path = "/") {
  await page.goto(path);
  await page.locator("#main-content button").filter({ visible: true }).first().click();
  await page.locator("#username").fill(email);
  if (!(await page.locator("#password").isVisible())) await page.locator("#kc-login").click();
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
  await expect(page.locator("#main-content h1").first()).toBeVisible();
}
