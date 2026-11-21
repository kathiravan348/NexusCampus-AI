/**
 * Adds a batch of Nexus Control texts (D53) to `packages/i18n/control/{en,hi,ta}.json`, keeping keys sorted by
 * insertion and refusing to overwrite an existing key. Used by Control screen tasks:
 *   node scripts/merge-control-texts.ts <en.json> <hi.json> <ta.json>
 * `en.json` maps key → [message, description]; `hi.json` / `ta.json` map key → message.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Source = Record<string, [string, string]>;
type Translations = Record<string, string>;

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "i18n",
  "control",
);
const [enFile, hiFile, taFile] = process.argv.slice(2);
if (!enFile || !hiFile || !taFile) {
  console.error("usage: node scripts/merge-control-texts.ts <en.json> <hi.json> <ta.json>");
  process.exit(1);
}

const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf-8")) as T;
const add: { en: Source; hi: Translations; ta: Translations } = {
  en: read<Source>(enFile),
  hi: read<Translations>(hiFile),
  ta: read<Translations>(taFile),
};

const keys = Object.keys(add.en);
for (const lang of ["hi", "ta"] as const) {
  const missing = keys.filter((k) => !(k in add[lang]));
  const extra = Object.keys(add[lang]).filter((k) => !(k in add.en));
  if (missing.length + extra.length > 0) {
    console.error(
      `${lang}: missing ${missing.join(", ") || "-"}; extra ${extra.join(", ") || "-"}`,
    );
    process.exit(1);
  }
}

const target = (lang: string) => path.join(dir, `${lang}.json`);
const en = read<Record<string, { message: string; description: string }>>(target("en"));
const hi = read<Translations>(target("hi"));
const ta = read<Translations>(target("ta"));
const clash = keys.filter((k) => k in en);
if (clash.length > 0) {
  console.error(`already present: ${clash.join(", ")}`);
  process.exit(1);
}
for (const key of keys) {
  const [message, description] = add.en[key] ?? ["", ""];
  en[key] = { message, description };
  hi[key] = add.hi[key] ?? "";
  ta[key] = add.ta[key] ?? "";
}
for (const [lang, data] of Object.entries({ en, hi, ta })) {
  writeFileSync(target(lang), `${JSON.stringify(data, null, 2)}\n`);
}
console.log(`Added ${keys.length} Control texts in en, hi, ta.`);
