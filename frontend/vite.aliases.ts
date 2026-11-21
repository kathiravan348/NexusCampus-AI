import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));

const packageEntry = (name: string): string =>
  path.join(frontendDir, "packages", name, "src", "index.ts");

/** `@nexus/*` aliases for Vite; keep in sync with `paths` in tsconfig.base.json. */
export const nexusAliases: Record<string, string> = {
  "@nexus/brand": path.join(frontendDir, "..", "brand.config.ts"),
  // Must come before "@nexus/ui-core": Vite matches aliases by prefix, in order.
  "@nexus/ui-core/contrast": path.join(
    frontendDir,
    "packages",
    "ui-core",
    "src",
    "theme",
    "contrast.ts",
  ),
  "@nexus/ui-core/styles.css": path.join(
    frontendDir,
    "packages",
    "ui-core",
    "src",
    "theme",
    "styles.css",
  ),
  "@nexus/ui-core": packageEntry("ui-core"),
  "@nexus/ui-edu": packageEntry("ui-edu"),
  "@nexus/i18n/resolve": path.join(frontendDir, "packages", "i18n", "src", "resolve.ts"),
  "@nexus/i18n/control": path.join(frontendDir, "packages", "i18n", "src", "control.tsx"),
  "@nexus/i18n": packageEntry("i18n"),
  "@nexus/offline": packageEntry("offline"),
  "@nexus/contracts": packageEntry("contracts"),
  "@nexus/services/control": path.join(
    frontendDir,
    "packages",
    "services",
    "src",
    "control",
    "index.ts",
  ),
  "@nexus/services": packageEntry("services"),
  "@nexus/mocks/control/browser": path.join(
    frontendDir,
    "packages",
    "mocks",
    "src",
    "control",
    "browser.ts",
  ),
  "@nexus/mocks/control": path.join(frontendDir, "packages", "mocks", "src", "control", "index.ts"),
  "@nexus/mocks": packageEntry("mocks"),
};
