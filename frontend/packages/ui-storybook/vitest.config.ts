import { defineConfig } from "vitest/config";
import { nexusAliases } from "../../vite.aliases";

export default defineConfig({
  resolve: {
    alias: nexusAliases,
  },
  test: {
    environment: "node",
  },
});
