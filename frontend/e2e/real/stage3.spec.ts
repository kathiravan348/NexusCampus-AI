import fs from "node:fs";
import { expect, test, type Page, type Response } from "@playwright/test";
import { expectScreenReady, menuPaths, withFreshPage } from "../helpers";
import { MISSING_CREDENTIALS, SKIP_REASON, realSignIn } from "./helpers";

test.skip(MISSING_CREDENTIALS, SKIP_REASON);

// As the Control real-mode checks (NEX-137): the bundled headless shell can crash on long real-mode loops.
const SYSTEM_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
test.use(fs.existsSync(SYSTEM_CHROME) ? { channel: "chrome" } : {});

/**
 * Stage 3 on real data (NEX-197): every menu screen for an admin, a teacher and a guardian loads from the real
 * backend — no server error, no `403` on a screen the menu offered, no visible "could not load" state.
 */
const PERSONAS = [
  { role: "admin", email: "priya.raman@littlesteps.example.edu", minScreens: 20 },
  { role: "teacher", email: "arjun.mehta@littlesteps.example.edu", minScreens: 8 },
  { role: "guardian", email: "sunita.rao@family.test", minScreens: 4 },
] as const;
const FAILED_TEXT = /could not load|couldn't load|failed to load|something went wrong|no access/i;

function watch(page: Page, problems: string[], current: () => string) {
  page.on("response", (response: Response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/v1/")) return;
    const status = response.status();
    if (status >= 500 || status === 403)
      problems.push(`${current()} → ${status} ${response.request().method()} ${url.pathname}`);
  });
}

for (const persona of PERSONAS) {
  test(`@real stage 3: every ${persona.role} screen on real data`, async ({ browser, baseURL }) => {
    test.setTimeout(10 * 60_000);
    await withFreshPage(browser, { baseURL: baseURL ?? "" }, async (page) => {
      const problems: string[] = [];
      let current = "/";
      watch(page, problems, () => current);
      console.log(`[stage3] ${persona.role}: signing in`);
      await realSignIn(page, persona.email);
      console.log(`[stage3] ${persona.role}: signed in`);
      const paths = await menuPaths(page);
      expect(paths.length).toBeGreaterThanOrEqual(persona.minScreens);
      for (const path of paths) {
        current = path;
        console.log(`[stage3] ${persona.role}: ${path}`);
        await page.goto(path);
        await expectScreenReady(page);
        // Error states are headings or alerts; screen content (e.g. the texts editor) may quote error messages.
        const states = page.locator("#main-content").locator("h1, h2, h3, [role=alert]");
        const text = (await states.allInnerTexts()).join(" | ");
        if (FAILED_TEXT.test(text))
          problems.push(`${path} shows: ${FAILED_TEXT.exec(text)?.[0] ?? ""}`);
      }
      expect(problems, `${persona.role}: problems on real data`).toEqual([]);
    });
  });
}
