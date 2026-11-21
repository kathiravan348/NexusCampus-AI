/**
 * `pnpm --dir frontend texts:import [file]` — reads the corrected docs/review/TRANSLATIONS.csv (or `file`) and writes
 * changed Hindi / Tamil texts back into the catalogues (NEX-094, D54). English is never changed. A row whose
 * placeholders ({name}, {count}) or braces differ from English is refused and listed. Afterwards run the tests.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importRows, loadCatalogues, rowsFromCsv } from "./texts-csv.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.join(here, "..", "packages", "i18n");
const file = process.argv[2] ?? path.join(here, "..", "..", "docs", "review", "TRANSLATIONS.csv");

const result = importRows(loadCatalogues(i18nDir), rowsFromCsv(readFileSync(file, "utf-8")));
for (const line of result.changed) console.log(`updated  ${line}`);
for (const line of result.refused) console.error(`refused  ${line}`);
console.log(
  `${result.changed.length} texts updated, ${result.refused.length} refused. Next: pnpm --dir frontend test`,
);
if (result.refused.length > 0) process.exitCode = 1;
