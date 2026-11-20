import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    // Packages start empty (NEX-001); each gets tests in its own task.
    passWithNoTests: true,
    // Per-project times, top-5 slowest files and the check:test soft budget (AGENTS.md §8a, NEX-032).
    reporters: ["default", "./scripts/vitest-timing-reporter.ts"],
    projects: [
      "apps/*",
      "packages/*/vitest.config.ts",
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"], environment: "node" } },
    ],
  },
});
