/**
 * Language review file (NEX-094, D54): every user-visible text in one CSV — English, translator note, Hindi, Tamil.
 * Pure helpers shared by `texts-export.ts` and `texts-import.ts` (tested in `texts-csv.test.ts`).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const COLUMNS = ["catalogue", "key", "english", "note", "hindi", "tamil", "status"] as const;
/** Exported for every row; the reviewer may change it (for example to "checked"). Import ignores it. */
export const TO_CHECK = "to check";
const BOM = String.fromCharCode(0xfeff);
export type Row = Readonly<Record<(typeof COLUMNS)[number], string>>;

/** One CSV cell per RFC 4180: quoted when it holds a comma, quote or line break. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly Row[]): string {
  const lines = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(","))];
  // Byte-order mark: Excel opens UTF-8 (Hindi, Tamil) correctly only with it. Line feeds only: the repository
  // stores text with LF (.gitattributes); Excel and LibreOffice read it.
  return `${BOM}${lines.join("\n")}\n`;
}

export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((v) => v.trim() !== ""));
}

/** Rows keyed by column name; refuses a file whose header is not ours. */
export function rowsFromCsv(text: string): Row[] {
  const [header, ...body] = parseCsv(text);
  if (!header || COLUMNS.some((c, i) => header[i]?.trim() !== c)) {
    throw new Error(`The first line must be: ${COLUMNS.join(",")}`);
  }
  return body.map((r) => Object.fromEntries(COLUMNS.map((c, i) => [c, r[i] ?? ""])) as Row);
}

/** Argument names of an ICU message (`{name}`, `{count, plural, …}`), ignoring the words inside plural cases. */
export function placeholders(message: string): string[] {
  const names = new Set<string>();
  for (const m of message.matchAll(/\{\s*([A-Za-z_][\w]*)\s*(?=[,}])/g)) names.add(m[1] ?? "");
  return [...names].sort();
}

/** `null` when the translation keeps the English placeholders and balanced braces, else the reason. */
export function checkTranslation(english: string, translated: string): string | null {
  let depth = 0;
  for (const ch of translated) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth < 0) return "a } has no matching {";
  }
  if (depth !== 0) return "a { has no matching }";
  const want = placeholders(english).join(", ");
  const got = placeholders(translated).join(", ");
  return want === got ? null : `placeholders must be {${want}} but are {${got}}`;
}

/** A catalogue on disk: English with notes, and the Hindi and Tamil files. */
export interface Catalogue {
  readonly name: string;
  readonly english: Record<string, { readonly message: string; readonly note: string }>;
  readonly hindiFile: string;
  readonly tamilFile: string;
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf-8")) as T;

/** Institution app texts, Nexus Control texts (D53) and the terminology pack of each institution type. */
export function loadCatalogues(i18nDir: string): Catalogue[] {
  type Described = Record<string, { message: string; description: string }>;
  const described = (file: string) =>
    Object.fromEntries(
      Object.entries(readJson<Described>(file)).map(([k, v]) => [
        k,
        { message: v.message, note: v.description },
      ]),
    );
  const out: Catalogue[] = [
    {
      name: "app",
      english: described(path.join(i18nDir, "messages", "en.json")),
      hindiFile: path.join(i18nDir, "messages", "hi.json"),
      tamilFile: path.join(i18nDir, "messages", "ta.json"),
    },
    {
      name: "control",
      english: described(path.join(i18nDir, "control", "en.json")),
      hindiFile: path.join(i18nDir, "control", "hi.json"),
      tamilFile: path.join(i18nDir, "control", "ta.json"),
    },
  ];
  for (const file of readdirSync(path.join(i18nDir, "terminology", "en")).sort()) {
    const type = file.replace(/\.json$/, "");
    const plain = readJson<Record<string, string>>(path.join(i18nDir, "terminology", "en", file));
    out.push({
      name: `terms:${type}`,
      english: Object.fromEntries(
        Object.entries(plain).map(([k, v]) => [
          k,
          { message: v, note: `Word for this institution type (${type}).` },
        ]),
      ),
      hindiFile: path.join(i18nDir, "terminology", "hi", file),
      tamilFile: path.join(i18nDir, "terminology", "ta", file),
    });
  }
  return out;
}

export function exportRows(catalogues: readonly Catalogue[]): Row[] {
  return catalogues.flatMap((c) => {
    const hi = readJson<Record<string, string>>(c.hindiFile);
    const ta = readJson<Record<string, string>>(c.tamilFile);
    return Object.entries(c.english).map(([key, en]) => ({
      catalogue: c.name,
      key,
      english: en.message,
      note: en.note,
      hindi: hi[key] ?? "",
      tamil: ta[key] ?? "",
      status: TO_CHECK,
    }));
  });
}

export interface ImportResult {
  readonly changed: string[];
  readonly refused: string[];
}

/** Writes changed Hindi / Tamil texts back; English is never touched. Refused rows are reported, not written. */
export function importRows(catalogues: readonly Catalogue[], rows: readonly Row[]): ImportResult {
  const changed: string[] = [];
  const refused: string[] = [];
  for (const c of catalogues) {
    const hi = readJson<Record<string, string>>(c.hindiFile);
    const ta = readJson<Record<string, string>>(c.tamilFile);
    let dirty = false;
    for (const row of rows.filter((r) => r.catalogue === c.name)) {
      const en = c.english[row.key];
      if (!en) {
        refused.push(`${c.name} ${row.key}: no such text`);
        continue;
      }
      for (const [label, file, value] of [
        ["hindi", hi, row.hindi],
        ["tamil", ta, row.tamil],
      ] as const) {
        if (value.trim() === "" || value === file[row.key]) continue;
        const problem = checkTranslation(en.message, value);
        if (problem) {
          refused.push(`${c.name} ${row.key} (${label}): ${problem}`);
          continue;
        }
        file[row.key] = value;
        changed.push(`${c.name} ${row.key} (${label})`);
        dirty = true;
      }
    }
    if (dirty) {
      writeFileSync(c.hindiFile, `${JSON.stringify(hi, null, 2)}\n`);
      writeFileSync(c.tamilFile, `${JSON.stringify(ta, null, 2)}\n`);
    }
  }
  const known = new Set(catalogues.map((c) => c.name));
  for (const row of rows) {
    if (!known.has(row.catalogue)) refused.push(`${row.catalogue} ${row.key}: unknown catalogue`);
  }
  return { changed, refused };
}
