import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectScreenReady, menuPaths, setTheme } from "../helpers";
import { ADMIN_EMAIL, MISSING_CREDENTIALS, SKIP_REASON, realSignIn } from "./helpers";

test.skip(MISSING_CREDENTIALS, SKIP_REASON);

/**
 * WCAG 2.2 AA on real data (NEX-065): axe on every menu screen, light and dark, signed in through Keycloak against
 * the real backend. No serious or critical violations.
 */
for (const theme of ["light", "dark"] as const) {
  test(`@real a11y: every screen in ${theme} on real data`, async ({ page }) => {
    await setTheme(page, theme);
    await realSignIn(page, ADMIN_EMAIL);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const paths = ["/", ...(await menuPaths(page))];
    expect(paths.length).toBeGreaterThan(5);

    const found: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      await expectScreenReady(page);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      for (const v of result.violations) {
        if (v.impact !== "serious" && v.impact !== "critical") continue;
        const targets = v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ");
        found.push(`${path} [${v.impact}] ${v.id}: ${v.nodes.length} node(s) — ${targets}`);
      }
    }
    expect(found, "serious/critical axe violations").toEqual([]);
  });
}
