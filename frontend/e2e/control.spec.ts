import { expect, test, type Page } from "@playwright/test";
import { demoBanner, rawKeys, watchErrors } from "./helpers";

/** Nexus Control demo staff, one per role (mirrors `@nexus/mocks/control` fixtures; e2e stays independent). */
const STAFF = [
  { name: "Nisha Verma", role: "super admin", minPages: 18 },
  { name: "Arjun Mehta", role: "sales", minPages: 5 },
  { name: "Farah Khan", role: "billing", minPages: 4 },
  { name: "A. Morgan", role: "support", minPages: 5 },
  { name: "Ravi Shankar", role: "implementation", minPages: 6 },
  { name: "Lena Fischer", role: "release manager", minPages: 3 },
  { name: "E. Lindqvist", role: "site reliability", minPages: 4 },
  { name: "C. Okafor", role: "security officer", minPages: 4 },
  { name: "Suresh Babu", role: "partner", minPages: 3 },
] as const;

async function signIn(page: Page, name: string) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await expect(page.locator("main h1").first()).toBeVisible();
}

async function menuPaths(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator("aside nav")
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  return hrefs.filter((h) => h !== "/" && h !== "");
}

/** Every staff role opens every page in its menu: heading, demo banner, no errors, no raw keys (NEX-091). */
for (const staff of STAFF) {
  test(`control: ${staff.role} opens every menu page`, async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, staff.name);
    await expect(demoBanner(page)).toBeVisible();

    const paths = await menuPaths(page);
    expect(paths.length).toBeGreaterThanOrEqual(staff.minPages);
    for (const path of paths) {
      await test.step(path, async () => {
        await page.goto(path);
        await expect(page.locator("main h1").first()).toBeVisible();
        await expect(page.getByRole("heading", { name: "No access" })).toHaveCount(0);
        await expect(demoBanner(page)).toBeVisible();
        // Work emails such as `a.morgan@…` look like keys to the shared check; they are data, not UI text.
        const keys = (await rawKeys(page)).filter((k) => !k.includes("@"));
        expect(keys, `raw message keys on ${path}`).toEqual([]);
      });
    }
    expect(errors, "console errors").toEqual([]);
  });
}
