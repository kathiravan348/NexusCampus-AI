import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { hrtime } from "node:process";
import { fileURLToPath } from "node:url";
import { evaluateBudget, formatDuration, timingLine, type BudgetResult } from "./timing-budgets.ts";

/**
 * Times a command and prints `[timing] …` with its soft budget (AGENTS.md §8a, D37). Zero dependencies.
 *
 *   node scripts/time-run.ts <key> [--label <name>] [--ready-pattern <regex>] [--exit-after-ready] -- <cmd...>
 *   node scripts/time-run.ts <key> [--label <name>] --sequence <step> [<step>...]
 *
 * A sequence step is a package script name, or `<budget-key>=<script>`; each runs as `pnpm run <script>`, in
 * order, stopping at the first failure. The child's exit code is kept; a budget warning never fails a run.
 */

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*[A-Za-z]", "g");

export interface RunOptions {
  readonly key: string;
  readonly label?: string;
  readonly command: string;
  readonly readyPattern?: RegExp;
  readonly exitAfterReady?: boolean;
  readonly cwd?: string;
  /** Where `[timing]` lines go (default: console.log). */
  readonly log?: (line: string) => void;
  /** Do not echo the child's output (tests, measure script). */
  readonly quiet?: boolean;
}

export interface RunResult {
  readonly exitCode: number;
  /** Start to exit, or start to ready when a ready pattern matched. */
  readonly ms: number;
  readonly ready: boolean;
  readonly budget: BudgetResult;
}

const now = (): bigint => hrtime.bigint();
const elapsedMs = (start: bigint): number => Number(now() - start) / 1e6;

/** Ends the whole process tree, so no Vite or Storybook server is left running. */
export function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

export function runTimed(options: RunOptions): Promise<RunResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const label = options.label ?? options.key;
  const watch = options.readyPattern !== undefined;
  const start = now();
  const child = spawn(options.command, {
    shell: true,
    cwd: options.cwd,
    stdio: [
      "inherit",
      watch || options.quiet ? "pipe" : "inherit",
      watch || options.quiet ? "pipe" : "inherit",
    ],
    // Own process group on POSIX so the whole tree can be ended after "ready".
    detached: options.exitAfterReady === true && process.platform !== "win32",
  });
  const ignoreInterrupt = () => undefined; // Ctrl+C reaches the child; wait for it to exit.
  process.on("SIGINT", ignoreInterrupt);

  return new Promise((resolve) => {
    let readyMs: number | null = null;
    let killed = false;
    let tail = "";
    const onData = (chunk: Buffer, sink: NodeJS.WriteStream) => {
      if (!options.quiet) sink.write(chunk);
      if (!watch || readyMs !== null || !options.readyPattern) return;
      tail = (tail + chunk.toString("utf8").replace(ANSI, "")).slice(-4096);
      if (!options.readyPattern.test(tail)) return;
      readyMs = elapsedMs(start);
      log(timingLine(`${label} ready`, evaluateBudget(options.key, readyMs)));
      if (options.exitAfterReady && child.pid !== undefined) {
        killed = true;
        killTree(child.pid);
      }
    };
    child.stdout?.on("data", (c: Buffer) => onData(c, process.stdout));
    child.stderr?.on("data", (c: Buffer) => onData(c, process.stderr));

    const finish = (code: number | null) => {
      process.off("SIGINT", ignoreInterrupt);
      const total = elapsedMs(start);
      const ms = readyMs ?? total;
      const exitCode = killed ? 0 : (code ?? 1);
      const budget = evaluateBudget(options.key, ms);
      if (readyMs === null) log(timingLine(label, budget));
      else if (!killed) log(`[timing] ${label} ran for ${formatDuration(total)} in total`);
      resolve({ exitCode, ms, ready: readyMs !== null, budget });
    };
    child.on("error", () => finish(1));
    child.on("close", (code) => finish(code));
  });
}

export interface SequenceStep {
  readonly key: string;
  readonly script: string;
}

export function parseStep(spec: string): SequenceStep {
  const at = spec.indexOf("=");
  return at > 0
    ? { key: spec.slice(0, at), script: spec.slice(at + 1) }
    : { key: spec, script: spec };
}

export interface SequenceResult {
  readonly exitCode: number;
  readonly steps: readonly RunResult[];
  readonly total: BudgetResult;
}

/** The per-step table printed after a sequence (markdown, so it can be pasted into TIMINGS.md). */
export function sequenceTable(
  label: string,
  steps: readonly RunResult[],
  total: BudgetResult,
): string {
  const row = (r: BudgetResult) =>
    `| ${r.key} | ${formatDuration(r.ms)} | ${r.budgetMs === null ? "—" : formatDuration(r.budgetMs)} | ${
      r.budgetMs === null ? "—" : r.over ? "WARN" : "OK"
    } |`;
  return [
    `[timing] ${label} steps`,
    "| Step | Time | Budget | Status |",
    "|---|---|---|---|",
    ...steps.map((s) => row(s.budget)),
    row(total),
  ].join("\n");
}

export async function runSequence(
  key: string,
  label: string,
  specs: readonly string[],
  options: Pick<RunOptions, "cwd" | "log" | "quiet"> & {
    command?: (script: string) => string;
  } = {},
): Promise<SequenceResult> {
  const log = options.log ?? ((line: string) => console.log(line));
  const toCommand = options.command ?? ((script: string) => `pnpm run ${script}`);
  const start = now();
  const steps: RunResult[] = [];
  let exitCode = 0;
  for (const spec of specs) {
    const step = parseStep(spec);
    const result = await runTimed({
      ...options,
      key: step.key,
      command: toCommand(step.script),
      log,
    });
    steps.push(result);
    if (result.exitCode !== 0) {
      exitCode = result.exitCode;
      break;
    }
  }
  const total = evaluateBudget(key, elapsedMs(start));
  log(sequenceTable(label, steps, total));
  log(timingLine(label, total));
  return { exitCode, steps, total };
}

export interface ParsedArgs {
  readonly key: string;
  readonly label?: string;
  readonly readyPattern?: RegExp;
  readonly exitAfterReady: boolean;
  readonly sequence: readonly string[] | null;
  readonly command: string;
}

const quote = (arg: string): string => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [key, ...rest] = argv;
  if (!key || key.startsWith("-"))
    throw new Error("time-run: the first argument is the budget key");
  let label: string | undefined;
  let readyPattern: RegExp | undefined;
  let exitAfterReady = false;
  let sequence: string[] | null = null;
  let command: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;
    if (arg === "--") {
      command = rest.slice(i + 1);
      break;
    }
    if (arg === "--label") label = rest[++i];
    else if (arg === "--ready-pattern") readyPattern = new RegExp(rest[++i] ?? "");
    else if (arg === "--exit-after-ready") exitAfterReady = true;
    else if (arg === "--sequence") {
      sequence = rest.slice(i + 1);
      break;
    } else throw new Error(`time-run: unknown option ${arg}`);
  }
  if (sequence === null && command.length === 0) throw new Error("time-run: no command after --");
  if (sequence !== null && sequence.length === 0)
    throw new Error("time-run: --sequence needs steps");
  return {
    key,
    label,
    readyPattern,
    exitAfterReady,
    sequence,
    command: command.map(quote).join(" "),
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const label = args.label ?? args.key;
  if (args.sequence) return (await runSequence(args.key, label, args.sequence)).exitCode;
  const result = await runTimed({
    key: args.key,
    label,
    command: args.command,
    readyPattern: args.readyPattern,
    exitAfterReady: args.exitAfterReady,
  });
  return result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(2);
    },
  );
}
