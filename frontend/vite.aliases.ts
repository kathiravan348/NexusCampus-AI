import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));

const packageEntry = (name: string): string =>
  path.join(frontendDir, "packages", name, "src", "index.ts");

/** `@nexus/*` aliases for Vite; keep in sync with `paths` in tsconfig.base.json. */
export const nexusAliases: Record<string, string> = {
  "@nexus/brand": path.join(frontendDir, "..", "brand.config.ts"),
  "@nexus/ui-core": packageEntry("ui-core"),
  "@nexus/ui-edu": packageEntry("ui-edu"),
  "@nexus/i18n": packageEntry("i18n"),
  "@nexus/offline": packageEntry("offline"),
  "@nexus/contracts": packageEntry("contracts"),
  "@nexus/services": packageEntry("services"),
  "@nexus/mocks": packageEntry("mocks"),
};
