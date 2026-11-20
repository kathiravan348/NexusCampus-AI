import path from "node:path";
import { hrtime } from "node:process";
import type { Reporter, TestModule } from "vitest/node";
import { evaluateBudget, formatDuration, timingLine } from "./timing-budgets.ts";

/**
 * Vitest reporter (zero runtime dependencies): per-project test time, wall total, top-5 slowest test files and the
 * `check:test` soft budget (AGENTS.md §8a). Runs next to Vitest's "default" reporter from the root config.
 */

export interface ModuleTiming {
  readonly project: string;
  readonly file: string;
  readonly ms: number;
}

export interface TimingSummary {
  readonly projects: readonly {
    readonly project: string;
    readonly files: number;
    readonly ms: number;
  }[];
  readonly slowest: readonly ModuleTiming[];
}

/** Sums file times per project (busiest first) and picks the slowest files. */
export function summarize(modules: readonly ModuleTiming[], top = 5): TimingSummary {
  const byProject = new Map<string, { files: number; ms: number }>();
  for (const m of modules) {
    const entry = byProject.get(m.project) ?? { files: 0, ms: 0 };
    byProject.set(m.project, { files: entry.files + 1, ms: entry.ms + m.ms });
  }
  return {
    projects: [...byProject.entries()]
      .map(([project, v]) => ({ project, ...v }))
      .sort((a, b) => b.ms - a.ms),
    slowest: [...modules].sort((a, b) => b.ms - a.ms).slice(0, top),
  };
}

export function renderSummary(summary: TimingSummary, wallMs: number): string {
  return [
    "[timing] tests by project (file time, summed across workers):",
    ...summary.projects.map(
      (p) => `[timing]   ${p.project}: ${formatDuration(p.ms)} (${p.files} files)`,
    ),
    "[timing] slowest test files:",
    ...summary.slowest.map(
      (m, i) => `[timing]   ${i + 1}. ${m.file} (${m.project}) ${formatDuration(m.ms)}`,
    ),
    timingLine("check:test", evaluateBudget("check:test", wallMs)),
  ].join("\n");
}

export class TimingReporter implements Reporter {
  private start = hrtime.bigint();
  private root = process.cwd();

  onInit(ctx: { config: { root: string } }): void {
    this.start = hrtime.bigint();
    this.root = ctx.config.root;
  }

  onTestRunEnd(testModules: readonly TestModule[]): void {
    const wallMs = Number(hrtime.bigint() - this.start) / 1e6;
    const modules = testModules.map((m) => ({
      project: m.project.name || "root",
      file: path.relative(this.root, m.moduleId).replaceAll("\\", "/"),
      ms: m.diagnostic().duration,
    }));
    console.log(`\n${renderSummary(summarize(modules), wallMs)}`);
  }
}

export default TimingReporter;
