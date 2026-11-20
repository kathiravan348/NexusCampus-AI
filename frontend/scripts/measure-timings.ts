import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBudget, formatDuration } from "./timing-budgets.ts";
import { runSequence, runTimed, type RunResult } from "./time-run.ts";

/**
 * `pnpm timings:measure`: cold and warm start probes plus a full `review:check`, printed as markdown for
 * `docs/TIMINGS.md` (AGENTS.md §8a). Servers use spare ports and are ended with their whole process tree.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const campus = path.join(root, "apps", "campus");
const storybook = path.join(root, "packages", "ui-storybook");
const READY = /Local:|started/i;

interface Probe {
  readonly key: string;
  readonly place: string;
  readonly command: string;
  readonly cwd: string;
  /** Removed before the cold run (bundler caches). */
  readonly caches: readonly string[];
  readonly server: boolean;
}

const PROBES: readonly Probe[] = [
  {
    key: "dev:campus",
    place: "campus dev server",
    command: "pnpm exec vite --port 3191 --strictPort",
    cwd: campus,
    caches: [path.join(campus, "node_modules", ".vite")],
    server: true,
  },
  {
    key: "build:campus",
    place: "campus build",
    command: "pnpm exec vite build",
    cwd: campus,
    caches: [],
    server: false,
  },
  {
    key: "preview:campus",
    place: "campus preview (built)",
    command: "pnpm exec vite preview --port 3192 --strictPort",
    cwd: campus,
    caches: [],
    server: true,
  },
  {
    key: "dev:storybook",
    place: "Storybook dev server",
    command: "pnpm exec storybook dev -p 6091 --ci --no-open",
    cwd: storybook,
    caches: [
      path.join(storybook, "node_modules", ".cache"),
      path.join(storybook, "node_modules", ".vite"),
    ],
    server: true,
  },
];

const cell = (r: RunResult | null) =>
  r === null ? "—" : `${formatDuration(r.ms)}${r.exitCode === 0 ? "" : " (failed)"}`;

async function probe(p: Probe, cold: boolean): Promise<RunResult> {
  if (cold) for (const dir of p.caches) rmSync(dir, { recursive: true, force: true });
  return runTimed({
    key: p.key,
    label: `${p.key} (${cold ? "cold" : "warm"})`,
    command: p.command,
    cwd: p.cwd,
    quiet: true,
    ...(p.server ? { readyPattern: READY, exitAfterReady: true } : {}),
  });
}

async function measure(): Promise<number> {
  const rows: string[] = [];
  for (const p of PROBES) {
    const cold = await probe(p, true);
    const warm = p.server ? await probe(p, false) : null;
    const worst = Math.max(cold.ms, warm?.ms ?? 0);
    const budget = evaluateBudget(p.key, worst);
    rows.push(
      `| ${p.place} | \`${p.key}\` | ${cell(cold)} | ${cell(warm)} | ${formatDuration(budget.budgetMs ?? 0)} | ${
        budget.over ? "WARN" : "OK"
      } |`,
    );
  }

  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")) as {
    scripts: Record<string, string>;
  };
  const steps =
    (pkg.scripts["review:check"] ?? "").split("--sequence")[1]?.trim().split(/\s+/) ?? [];
  const review = await runSequence("review:check", "review:check", steps, {
    cwd: root,
    quiet: true,
  });

  console.log("\n## Starts and builds (this machine)\n");
  console.log("| Place | Key | Cold | Warm | Budget | Status |\n|---|---|---|---|---|---|");
  console.log(rows.join("\n"));
  console.log("\n## review:check\n");
  console.log("| Step | Time | Budget | Status |\n|---|---|---|---|");
  for (const s of [...review.steps.map((r) => r.budget), review.total]) {
    console.log(
      `| ${s.key} | ${formatDuration(s.ms)} | ${s.budgetMs === null ? "—" : formatDuration(s.budgetMs)} | ${
        s.budgetMs === null ? "—" : s.over ? "WARN" : "OK"
      } |`,
    );
  }
  return review.exitCode;
}

measure().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
