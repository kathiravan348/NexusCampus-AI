/**
 * `pnpm --dir frontend texts:export` — writes docs/review/TRANSLATIONS.csv with every user-visible text in English,
 * Hindi and Tamil (NEX-094, D54). Correct the Hindi / Tamil columns in Excel or LibreOffice, then run `texts:import`.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportRows, loadCatalogues, toCsv } from "./texts-csv.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.join(here, "..", "packages", "i18n");
const out = path.join(here, "..", "..", "docs", "review", "TRANSLATIONS.csv");

const rows = exportRows(loadCatalogues(i18nDir));
writeFileSync(out, toCsv(rows));
console.log(`Wrote ${rows.length} texts to docs/review/TRANSLATIONS.csv`);
