import { expect, type Locator, type Page } from "@playwright/test";

/** Demo tenants and personas (mirrors `@nexus/mocks` fixtures; e2e stays independent of app source). */
export const TENANTS = {
  littleSteps: { id: "ten-ls", name: "Little Steps", type: "EY" },
  riverside: { id: "ten-rv", name: "Riverside School", type: "K12 (group, 2 campuses, Hindi)" },
  northbridge: { id: "ten-nb", name: "Northbridge University", type: "HE" },
  apex: { id: "ten-ax", name: "Apex Coaching", type: "TP (Tamil)" },
  harmony: { id: "ten-hm", name: "Harmony Music Academy", type: "SK" },
} as const;

export const ADMINS: Readonly<Record<keyof typeof TENANTS, string>> = {
  littleSteps: "usr-ls-priya",
  riverside: "usr-rv-helen",
  northbridge: "usr-nb-robert",
  apex: "usr-ax-karthik",
  harmony: "usr-hm-weiling",
};

export const DEMO_BANNER = "Demo data. Nothing on this screen is real.";

/** The demo banner in any language (`DemoBanner` is the shell's first `role="note"`). */
export function demoBanner(page: Page): Locator {
  return page.getByRole("note").first();
}

/** Signs in through the session the app keeps per tab (the demo has no password), then opens `path`. */
export async function signInAs(page: Page, tenantId: string, userId: string, path = "/") {
  await page.goto("/sign-in");
  await page.evaluate(
    ([tenant, user]) =>
      sessionStorage.setItem("nexus.session", JSON.stringify({ tenantId: tenant, userId: user })),
    [tenantId, userId] as const,
  );
  await page.goto(path);
  await expect(page.locator("#main-content")).toBeVisible();
}

/** Picks the UI locale for a tenant before the app reads it (same store as the locale switch). */
export async function setLocale(page: Page, tenantId: string, locale: string) {
  await page.addInitScript(
    ([tenant, value]) => {
      const raw = localStorage.getItem("nexus.locale");
      const picks = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      localStorage.setItem("nexus.locale", JSON.stringify({ ...picks, [tenant]: value }));
    },
    [tenantId, locale] as const,
  );
}

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((value) => localStorage.setItem("nexus-theme", value), theme);
}

/**
 * The visible main navigation in any language; on narrow screens it opens the menu first (the menu button is
 * the header's first button, shown below `md`).
 */
export async function openNav(page: Page): Promise<Locator> {
  const toggle = page.locator("header button").first();
  if ((await page.locator("aside nav").isHidden()) && (await toggle.isVisible()))
    await toggle.click();
  const nav = page.getByRole("navigation").filter({ visible: true });
  await expect(nav).toBeVisible();
  return nav;
}

/** Hrefs of every module in the menu (Home excluded). */
export async function menuPaths(page: Page): Promise<string[]> {
  const nav = await openNav(page);
  const hrefs = await nav
    .getByRole("link")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  await page.keyboard.press("Escape");
  return hrefs.filter((h) => h !== "/" && h !== "");
}

/**
 * Text nodes that look like an untranslated message key, e.g. `m02.nav.title`. Monospace technical codes
 * (`code`, `.font-mono`, such as audit action codes `m02.user.invited`) are identifiers, not UI text.
 */
export function rawKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const technical = node.parentElement?.closest("code, .font-mono") != null;
      if (!technical && /^[a-z]\d*\.[a-z]/.test(text) && !/\s/.test(text)) out.push(text);
    }
    return out;
  });
}

/** Collects console errors and uncaught page errors for a test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** The page's module heading once its data has loaded (no spinner left). */
export async function expectScreenReady(page: Page) {
  await expect(page.locator("#main-content h1").first()).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /^(Loading|लोड हो रहा है|ஏற்றுகிறது)/ }),
  ).toHaveCount(0);
}
