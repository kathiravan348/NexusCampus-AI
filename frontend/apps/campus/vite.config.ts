import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { nexusAliases } from "../../vite.aliases";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: nexusAliases,
  },
  server: {
    port: 3100,
    host: "127.0.0.1",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
