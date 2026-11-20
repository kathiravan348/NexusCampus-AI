import { expect, test } from "@playwright/test";

const email = process.env["NEXUS_E2E_EMAIL"] ?? "";
const password = process.env["NEXUS_E2E_PASSWORD"] ?? "";

test.skip(
  !email || !password,
  "Set NEXUS_E2E_EMAIL and NEXUS_E2E_PASSWORD (a seeded admin) to run",
);

test("@real Keycloak sign-in; setup, theme, texts, modules, audit, requests, offline sync; device wipe", async ({
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

  // Audit & privacy (NEX-062): the page chain check of the real log.
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Check this page" }).click();
  await expect(page.getByText(/linked and intact/)).toBeVisible();

  // Data requests (NEX-062): move an open request one step, when the tenant has one.
  await page.getByRole("tab", { name: "Data requests" }).click();
  const start = page.getByRole("button", { name: "Start work" });
  const complete = page.getByRole("button", { name: "Mark completed" });
  const people = page.getByRole("table").getByRole("button");
  let stepped = false;
  for (let i = 0; i < (await people.count()) && !stepped; i += 1) {
    await people.nth(i).click();
    for (const action of [start, complete]) {
      if (!stepped && (await action.count()) > 0) {
        await action.first().click();
        await expect(page.getByText("Request updated.")).toBeVisible();
        stepped = true;
      }
    }
  }
  test
    .info()
    .annotations.push({ type: "dsr", description: stepped ? "stepped" : "no open request" });

  // Notifications (NEX-062): a preference saved offline syncs once, through the idempotent API.
  const updates = async () => {
    const res = await page.request.get("/api/v1/audit-events", {
      params: { action: "m07.preference.updated", pageSize: "1" },
    });
    return ((await res.json()) as { total: number }).total;
  };
  const prefsBefore = await updates();
  await page.goto("/notifications");
  await page.getByRole("tab", { name: /preferences/i }).click();
  const quiet = page.getByRole("switch", { name: "Hold messages during quiet hours" });
  await page.context().setOffline(true);
  await quiet.click();
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(
    page.getByText("Saved on this device. It will sync when you are back online."),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect.poll(updates, { timeout: 30_000 }).toBe(prefsBefore + 1);
  await page.waitForTimeout(1_500);
  expect(await updates()).toBe(prefsBefore + 1); // replayed exactly once
  await page.reload();
  await page.getByRole("tab", { name: /preferences/i }).click();
  await page.getByRole("switch", { name: "Hold messages during quiet hours" }).click();
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText("Preferences saved.")).toBeVisible();

  await page.goto("/access");
  await expect(page.getByRole("heading", { level: 1, name: "Users & access" })).toBeVisible();
  // Sync centre (NEX-062): revoking this very device wipes it and signs the user out.
  await page.goto("/sync");
  await page.getByRole("tab", { name: "Devices", exact: true }).click();
  const devices = (await (
    await page.request.get("/api/v1/devices", { params: { pageSize: "200" } })
  ).json()) as {
    items: { id: string; label: string; status: string; userId: string }[];
  };
  const mine = devices.items
    .filter((d) => d.status === "active" && d.label.startsWith("Web browser"))
    .sort((a, b) => b.id.localeCompare(a.id))[0];
  expect(mine).toBeDefined();
  await page.getByRole("button", { name: `Revoke and wipe ${mine!.label}` }).click();
  await expect(
    page.getByText("This is the device you are using now.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Yes, this device" }).click();
  await page.getByRole("button", { name: "Revoke & wipe" }).last().click();
  await expect(
    page.getByRole("button", { name: "Sign in with your institution account" }),
  ).toBeVisible({
    timeout: 20_000,
  });
});
