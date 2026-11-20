import { expect, test } from "@playwright/test";

const email = process.env["NEXUS_E2E_EMAIL"] ?? "";
const password = process.env["NEXUS_E2E_PASSWORD"] ?? "";

test.skip(
  !email || !password,
  "Set NEXUS_E2E_EMAIL and NEXUS_E2E_PASSWORD (a seeded admin) to run",
);

test("@real signs in through Keycloak; setup, theme, texts and modules persist; signs out", async ({
  page,
}) => {
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

  // Theme studio (NEX-061): a brand colour persists and applies at runtime.
  await page.goto("/theme");
  const brand = page.locator("#token-light-brand-primary");
  const original = await brand.inputValue();
  const next = original.toUpperCase() === "#9A1C14" ? "#B42318" : "#9A1C14";
  await brand.fill(next);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(page.getByRole("button", { name: /^Save/ }).first()).toBeDisabled();
  await page.reload();
  await expect(page.locator("#token-light-brand-primary")).toHaveValue(next);
  const applied = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim(),
  );
  expect(applied.toUpperCase()).toBe(next);
  await page.locator("#token-light-brand-primary").fill(original);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(page.getByRole("button", { name: /^Save/ }).first()).toBeDisabled();

  // Text studio (NEX-061): an override reaches the runtime text bundle after a reload.
  await page.goto("/texts");
  await page
    .getByRole("row", { name: /common\.save/ })
    .getByRole("button")
    .first()
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("Store edits");
  await page.getByRole("dialog").getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/theme");
  await expect(page.getByRole("button", { name: "Store edits" })).toBeVisible();
  await page.goto("/texts");
  await page
    .getByRole("row", { name: /common\.save/ })
    .getByRole("button")
    .first()
    .click();
  await page.getByText("Remove override").click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // Plan & usage (NEX-061): switching a module off hides it at once and persists.
  await page.goto("/plan");
  const sync = page.getByRole("row", { name: /M10/ }).getByRole("switch");
  await expect(sync).toHaveAttribute("aria-checked", "true");
  await sync.click();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Sync centre" })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole("row", { name: /M10/ }).getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("row", { name: /M10/ }).getByRole("switch").click();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Sync centre" })).toHaveCount(
    1,
  );

  await page.goto("/access");
  await expect(page.getByRole("heading", { level: 1, name: "Users & access" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in with your institution account" }),
  ).toBeVisible();
});
