import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { VitePWA } from "vite-plugin-pwa";
import { brand } from "../../../brand.config";
import tailwindcss from "@tailwindcss/vite";
import { nexusAliases } from "../../vite.aliases";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const mocksSrc = path.join(appDir, "..", "..", "packages", "mocks", "src");

/** Manifest colours come from the theme tokens at build time — no colour literal here (D7). */
const tokens = JSON.parse(
  readFileSync(
    path.join(appDir, "..", "..", "packages", "ui-core", "src", "theme", "tokens.json"),
    "utf-8",
  ),
) as { color: { tokens: { name: string; value: { light: string } }[] } };
const token = (name: string) => tokens.color.tokens.find((t) => t.name === name)?.value.light;

export default defineConfig(({ mode }) => {
  // `--mode review` = the Stage 1 review build (`pnpm review:start`, e2e): production build on mock data.
  if (mode === "review") process.env["VITE_DATA_MODE"] ??= "mock";
  return {
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        // Own worker (src/sw/sw.ts) so mock builds can host MSW in the same worker (NEX-038).
        strategies: "injectManifest",
        srcDir: "src/sw",
        filename: "sw.ts",
        manifest: {
          name: brand.products.campus.name,
          short_name: brand.products.campus.short,
          description: brand.products.campus.description,
          start_url: "/",
          display: "standalone",
          theme_color: token("brand-primary"),
          background_color: token("bg-surface"),
          icons: [
            { src: brand.logo.icon192, sizes: "192x192", type: "image/png" },
            { src: brand.logo.icon512, sizes: "512x512", type: "image/png" },
            {
              src: brand.logo.iconMaskable512,
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,woff2,svg,png,ico}"],
          // The MSW worker is a dev/demo tool, never part of the precache (mock builds import it instead).
          globIgnores: ["**/mockServiceWorker.js"],
          rollupFormat: "iife",
        },
      }),
    ],
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
      alias: { "virtual:pwa-register": path.join(appDir, "src", "pwa", "pwaRegisterStub.ts") },
    },
  };
});
