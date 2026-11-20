import { describe, expect, it } from "vitest";
import { evaluateBudget, formatDuration, timingLine, TIMING_BUDGETS_MS } from "./timing-budgets.ts";
import { parseArgs, parseStep, runSequence, runTimed, sequenceTable } from "./time-run.ts";
import { renderSummary, summarize } from "./vitest-timing-reporter.ts";

const node = `"${process.execPath}"`;

function collect() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe("timing budgets", () => {
  it("formats seconds and minutes", () => {
    expect(formatDuration(1234)).toBe("1.23s");
    expect(formatDuration(0)).toBe("0.00s");
    expect(formatDuration(123_400)).toBe("2m 03.4s");
  });

  it("says OK within budget and WARN over it", () => {
    const budget = TIMING_BUDGETS_MS["check:format"];
    expect(timingLine("fmt", evaluateBudget("check:format", budget - 1))).toMatch(
      /^\[timing\] fmt: .* \(budget .* — OK\)$/,
    );
    expect(timingLine("fmt", evaluateBudget("check:format", budget + 1))).toContain(
      "WARN: over budget",
    );
  });

  it("has no budget for an unknown key", () => {
    const result = evaluateBudget("lint:scripts", 999_999);
    expect(result).toMatchObject({ budgetMs: null, over: false });
    expect(timingLine("x", result)).toContain("(no budget)");
  });

  it("keeps reserved keys for future surfaces", () => {
    for (const key of ["dev:control", "backend:start", "backend:check", "compose:up", "e2e"]) {
      expect(TIMING_BUDGETS_MS).toHaveProperty(key);
    }
  });
});

describe("time-run arguments", () => {
  it("parses options and the command", () => {
    const args = parseArgs([
      "dev:campus",
      "--label",
      "dev",
      "--ready-pattern",
      "Local:",
      "--",
      "vite",
      "--port",
      "3100",
    ]);
    expect(args).toMatchObject({
      key: "dev:campus",
      label: "dev",
      exitAfterReady: false,
      command: "vite --port 3100",
    });
    expect(args.readyPattern?.test("  Local: http://x")).toBe(true);
  });

  it("parses a sequence and budget-key steps", () => {
    expect(
      parseArgs(["review:check", "--sequence", "check:format", "build:all=build"]).sequence,
    ).toEqual(["check:format", "build:all=build"]);
    expect(parseStep("build:all=build")).toEqual({ key: "build:all", script: "build" });
    expect(parseStep("check:lint")).toEqual({ key: "check:lint", script: "check:lint" });
  });

  it("rejects a missing key or command", () => {
    expect(() => parseArgs(["--", "x"])).toThrow(/budget key/);
    expect(() => parseArgs(["k"])).toThrow(/no command/);
  });
});

describe("runTimed", () => {
  it("keeps the exit code and prints one timing line", async () => {
    const out = collect();
    const result = await runTimed({
      key: "test:pkg",
      command: `${node} -e "process.exit(3)"`,
      quiet: true,
      log: out.log,
    });
    expect(result.exitCode).toBe(3);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toMatch(/^\[timing\] test:pkg: \d+\.\d\ds \(budget/);
  });

  it("never fails a successful run that is over budget", async () => {
    const out = collect();
    const result = await runTimed({
      key: "boot:campus",
      command: `${node} -e "setTimeout(() => {}, 10)"`,
      quiet: true,
      log: out.log,
    });
    expect(result.exitCode).toBe(0);
  });

  it("times to the ready line and ends the server tree", async () => {
    const out = collect();
    const server = `${node} -e "console.log('booting'); setTimeout(() => console.log('Local: http://127.0.0.1'), 50); setInterval(() => {}, 1000)"`;
    const result = await runTimed({
      key: "dev:campus",
      label: "fake dev",
      command: server,
      readyPattern: /Local:/,
      exitAfterReady: true,
      quiet: true,
      log: out.log,
    });
    expect(result).toMatchObject({ exitCode: 0, ready: true });
    expect(out.lines[0]).toMatch(/^\[timing\] fake dev ready: /);
  }, 15_000);
});

describe("runSequence", () => {
  it("runs steps in order, prints a table and stops at the first failure", async () => {
    const out = collect();
    const result = await runSequence(
      "review:check",
      "review",
      ["check:format=ok", "check:lint=fail", "never"],
      {
        quiet: true,
        log: out.log,
        command: (script) => `${node} -e "process.exit(${script === "fail" ? 4 : 0})"`,
      },
    );
    expect(result.exitCode).toBe(4);
    expect(result.steps.map((s) => s.budget.key)).toEqual(["check:format", "check:lint"]);
    const table = out.lines.find((l) => l.startsWith("[timing] review steps")) ?? "";
    expect(table).toContain("| check:format |");
    expect(table).toContain("| review:check |");
    expect(out.lines.at(-1)).toMatch(/^\[timing\] review: /);
  }, 15_000);

  it("marks steps without a budget with a dash", () => {
    const table = sequenceTable("x", [], evaluateBudget("lint:scripts", 5));
    expect(table).toContain("| lint:scripts | 0.01s | — | — |");
  });
});

describe("Vitest timing reporter", () => {
  const modules = [
    { project: "campus", file: "a.test.tsx", ms: 900 },
    { project: "campus", file: "b.test.tsx", ms: 100 },
    { project: "@nexus/ui-core", file: "c.test.tsx", ms: 400 },
    { project: "@nexus/mocks", file: "d.test.ts", ms: 50 },
    { project: "@nexus/mocks", file: "e.test.ts", ms: 60 },
    { project: "@nexus/mocks", file: "f.test.ts", ms: 70 },
  ];

  it("sums per project and lists the five slowest files", () => {
    const summary = summarize(modules);
    expect(summary.projects[0]).toEqual({ project: "campus", files: 2, ms: 1000 });
    expect(summary.projects.map((p) => p.project)).toEqual([
      "campus",
      "@nexus/ui-core",
      "@nexus/mocks",
    ]);
    expect(summary.slowest.map((m) => m.file)).toEqual([
      "a.test.tsx",
      "c.test.tsx",
      "b.test.tsx",
      "f.test.ts",
      "e.test.ts",
    ]);
  });

  it("renders the breakdown with the check:test budget", () => {
    const text = renderSummary(summarize(modules), 2_000);
    expect(text).toContain("[timing]   campus: 1.00s (2 files)");
    expect(text).toContain("[timing]   1. a.test.tsx (campus) 0.90s");
    expect(text).toMatch(/\[timing\] check:test: 2\.00s \(budget .* — OK\)$/);
  });
});
