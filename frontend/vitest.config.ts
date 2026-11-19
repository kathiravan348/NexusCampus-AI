import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    // Packages start empty (NEX-001); each gets tests in its own task.
    passWithNoTests: true,
    projects: ["apps/*", "packages/*/vitest.config.ts"],
  },
});
