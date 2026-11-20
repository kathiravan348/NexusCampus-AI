/**
 * Soft time budgets for every start, test and check command (AGENTS.md §8a, D37).
 * A budget only warns: it never changes an exit code. Baselines live in `docs/TIMINGS.md`.
 */
export const TIMING_BUDGETS_MS = {
  // Project starts (boot to ready)
  "dev:campus": 8_000,
  "preview:campus": 5_000,
  "dev:storybook": 30_000,
  "boot:campus": 3_000,
  // Builds
  "build:campus": 45_000,
  "build:storybook": 120_000,
  "build:all": 180_000,
  // Checks and tests
  "check:format": 30_000,
  "check:lint": 90_000,
  "check:typecheck": 90_000,
  "check:test": 120_000,
  "review:check": 420_000,
  "test:pkg": 45_000,
  e2e: 180_000,
  // Backend (NEX-042; read by backend/src/nexus/core/timing.py)
  "backend:start": 15_000,
  "backend:check": 180_000,
  "compose:up": 90_000,
  // Reserved for surfaces that do not exist yet (Stage 2)
  "dev:control": 8_000,
} as const satisfies Record<string, number>;

export type TimingKey = keyof typeof TIMING_BUDGETS_MS;

export function isTimingKey(key: string): key is TimingKey {
  return Object.prototype.hasOwnProperty.call(TIMING_BUDGETS_MS, key);
}

/** `1234` → `"1.23s"`; a minute or more → `"2m 03.4s"`. */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 60_000) return `${(safe / 1000).toFixed(2)}s`;
  const minutes = Math.floor(safe / 60_000);
  const seconds = ((safe % 60_000) / 1000).toFixed(1).padStart(4, "0");
  return `${minutes}m ${seconds}s`;
}

export interface BudgetResult {
  readonly key: string;
  readonly ms: number;
  readonly budgetMs: number | null;
  readonly over: boolean;
}

/** Compares a measured time with its soft budget. Unknown keys have no budget and are never over. */
export function evaluateBudget(key: string, ms: number): BudgetResult {
  const budgetMs = isTimingKey(key) ? TIMING_BUDGETS_MS[key] : null;
  return { key, ms, budgetMs, over: budgetMs !== null && ms > budgetMs };
}

/** `[timing] <label>: X.XXs (budget Y.Ys — OK | WARN: over budget)` */
export function timingLine(label: string, result: BudgetResult): string {
  const budget =
    result.budgetMs === null
      ? "no budget"
      : `budget ${(result.budgetMs / 1000).toFixed(1)}s — ${result.over ? "WARN: over budget" : "OK"}`;
  return `[timing] ${label}: ${formatDuration(result.ms)} (${budget})`;
}
