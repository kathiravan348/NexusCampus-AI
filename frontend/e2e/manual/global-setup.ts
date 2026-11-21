import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Starts every manual run clean, so screens of removed features never linger in docs/manual. */
export default function globalSetup() {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/manual");
  for (const dir of ["screens", ".parts"]) {
    rmSync(path.join(out, dir), { recursive: true, force: true });
    mkdirSync(path.join(out, dir), { recursive: true });
  }
}
