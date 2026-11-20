import { expect, test } from "@playwright/test";

const email = process.env["NEXUS_E2E_EMAIL"] ?? "";
const password = process.env["NEXUS_E2E_PASSWORD"] ?? "";

test.skip(
  !email || !password,
  "Set NEXUS_E2E_EMAIL and NEXUS_E2E_PASSWORD (a seeded admin) to run",
);

test("@real signs in through Keycloak, edits Institution setup and signs out", async ({ page }) => {
  await page.goto("/setup");
  await page.getByRole("button", { name: "Sign in with your institution account" }).click();

  // Keycloak's own login page (stable ids; with identity-first login the password comes on a second step).
  await page.locator("#username").fill(email);
  if (!(await page.locator("#password").isVisible())) await page.locator("#kc-login").click();
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();

  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { level: 1, name: "Institution setup" })).toBeVisible();
  await page.getByRole("tab", { name: "Locale & formats" }).click();
  const hindi = page.getByRole("checkbox", { name: "Hindi (India) (hi-IN)" });
  const before = await hindi.getAttribute("aria-checked");
  await hindi.click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/i }).first()).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Locale & formats" }).click();
  await expect(page.getByRole("checkbox", { name: "Hindi (India) (hi-IN)" })).not.toHaveAttribute(
    "aria-checked",
    before ?? "false",
  );
  // Put it back, so the run can be repeated.
  await page.getByRole("checkbox", { name: "Hindi (India) (hi-IN)" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  await page.goto("/access");
  await expect(page.getByRole("heading", { level: 1, name: "Users & access" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with your institution account" }),
  ).toBeVisible();
});
