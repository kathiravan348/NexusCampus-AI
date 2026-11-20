/**
 * Dev-only boot timing (AGENTS.md §8a, NEX-032): `nexus:boot` marks for entry → MSW ready → React mount, and one
 * console line `[timing] boot:campus …`. Production builds drop all of it (`import.meta.env.DEV` is false).
 * The budget mirrors `boot:campus` in `scripts/timing-budgets.ts` (browser code cannot import Node scripts).
 */
const BOOT_BUDGET_MS = 3_000;

export function bootMark(step: "entry" | "msw-ready" | "mounted"): void {
  if (!import.meta.env.DEV) return;
  performance.mark(`nexus:boot:${step}`);
}

export function reportBoot(log: (line: string) => void = console.info): void {
  if (!import.meta.env.DEV) return;
  bootMark("mounted");
  const total = performance.measure("nexus:boot", { start: 0, end: "nexus:boot:mounted" }).duration;
  const steps = ["entry", "msw-ready", "mounted"]
    .map((step) => performance.getEntriesByName(`nexus:boot:${step}`, "mark")[0])
    .filter((mark): mark is PerformanceEntry => mark !== undefined)
    .map(
      (mark) => `${mark.name.slice("nexus:boot:".length)} ${(mark.startTime / 1000).toFixed(2)}s`,
    )
    .join(" → ");
  const status = total > BOOT_BUDGET_MS ? "WARN: over budget" : "OK";
  log(
    `[timing] boot:campus: ${(total / 1000).toFixed(2)}s (budget ${(BOOT_BUDGET_MS / 1000).toFixed(1)}s — ${status}) [${steps}]`,
  );
}
