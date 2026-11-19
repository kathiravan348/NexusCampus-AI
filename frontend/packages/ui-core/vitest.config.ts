import { defineConfig } from "vitest/config";
import { nexusAliases } from "../../vite.aliases";

export default defineConfig({
  resolve: {
    alias: nexusAliases,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
