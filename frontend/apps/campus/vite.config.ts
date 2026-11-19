import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nexusAliases } from "../../vite.aliases";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const mocksSrc = path.join(appDir, "..", "..", "packages", "mocks", "src");

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    // Subpath entries first: aliases match by prefix, in order.
    alias: {
      "@nexus/mocks/browser": path.join(mocksSrc, "browser.ts"),
      "@nexus/mocks/node": path.join(mocksSrc, "node.ts"),
      ...nexusAliases,
    },
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
