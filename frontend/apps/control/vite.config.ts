import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nexusAliases } from "../../vite.aliases";

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** Nexus Control (Stage 2, D50): provider staff app, online only, mock mode by default in dev. */
export default defineConfig(({ mode }) => {
  // `--mode review` = the Stage 2 review build (`pnpm review:start:control`, e2e): production build on mock data.
  if (mode === "review") process.env["VITE_DATA_MODE"] ??= "mock";
  // `pnpm dev:control:real` (NEX-100): the control backend on 127.0.0.1:8100, same-origin through the proxy below,
  // so its HttpOnly staff session cookie just works.
  if (mode === "real") process.env["VITE_DATA_MODE"] ??= "real";
  const real = process.env["VITE_DATA_MODE"] === "real";
  return {
    plugins: [tailwindcss(), react()],
    // Same brand files and MSW worker as campus; no copies to drift (D40).
    publicDir: path.join(appDir, "..", "campus", "public"),
    resolve: { alias: { ...nexusAliases } },
    server: {
      port: 3200,
      host: "127.0.0.1",
      ...(real
        ? { proxy: { "/control/api": { target: "http://127.0.0.1:8100", changeOrigin: false } } }
        : {}),
    },
    preview: { port: 3201, host: "127.0.0.1" },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
