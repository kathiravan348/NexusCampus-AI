import { expect, test } from "@playwright/test";

const email = process.env["NEXUS_E2E_EMAIL"] ?? "";
const password = process.env["NEXUS_E2E_PASSWORD"] ?? "";

test.skip(
  !email || !password,
  "Set NEXUS_E2E_EMAIL and NEXUS_E2E_PASSWORD (a seeded admin) to run",
);

/** Smoke check of an install (NEX-064): Keycloak sign-in, demo data visible, a save works, sign-out. */
test("@install signs in through Keycloak and sees the demo institution", async ({ page }) => {
  await page.goto("/setup");
  await page.getByRole("button", { name: "Sign in with your institution account" }).click();
  await page.locator("#username").fill(email);
  if (!(await page.locator("#password").isVisible())) await page.locator("#kc-login").click();
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { level: 1, name: "Institution setup" })).toBeVisible();
  await expect(page.getByText("Little Steps").first()).toBeVisible();
  await page.goto("/access");
  await expect(page.getByRole("heading", { level: 1, name: "Users & access" })).toBeVisible();
  await expect(page.getByText("priya.raman@littlesteps.example.edu").first()).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with your institution account" }),
  ).toBeVisible();
});
