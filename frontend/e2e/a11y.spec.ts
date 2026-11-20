import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ADMINS, TENANTS, expectScreenReady, menuPaths, setTheme, signInAs } from "./helpers";

/** axe on the home screen and every module screen, light and dark: no serious or critical violations. */
for (const theme of ["light", "dark"] as const) {
  test(`a11y: every screen in ${theme} has no serious or critical axe violations`, async ({
    page,
  }) => {
    await setTheme(page, theme);
    await signInAs(page, TENANTS.littleSteps.id, ADMINS.littleSteps);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const paths = ["/", ...(await menuPaths(page))];

    const found: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      await expectScreenReady(page);
      const result = await new AxeBuilder({ page }).analyze();
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
