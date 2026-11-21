import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findUnknownClasses, readTheme } from "../../../packages/ui-core/scripts/check-classes";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const theme = readTheme(
  fs.readFileSync(
    path.join(
      srcDir,
      "..",
      "..",
      "..",
      "packages",
      "ui-core",
      "src",
      "theme",
      "tailwind-theme.css",
    ),
    "utf-8",
  ),
);

function screens(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return screens(full);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [full] : [];
  });
}

describe("Control screens use theme tokens only (D7)", () => {
  it("has no colour, text or radius class without a token", () => {
    const unknown = screens(srcDir).flatMap((file) =>
      findUnknownClasses(fs.readFileSync(file, "utf-8"), theme).map(
        (cls) => `${path.relative(srcDir, file)}: ${cls}`,
      ),
    );
    expect(unknown).toEqual([]);
  });
});
