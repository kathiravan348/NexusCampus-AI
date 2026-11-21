import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkTranslation,
  exportRows,
  importRows,
  loadCatalogues,
  parseCsv,
  placeholders,
  rowsFromCsv,
  toCsv,
  type Row,
} from "./texts-csv.ts";

function fakeI18n(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nexus-texts-"));
  const write = (rel: string, data: unknown) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), JSON.stringify(data));
  };
  write("messages/en.json", {
    "common.hello": { message: "Hello, {name}", description: "Greeting with a name." },
  });
  write("messages/hi.json", { "common.hello": "नमस्ते, {name}" });
  write("messages/ta.json", { "common.hello": "வணக்கம், {name}" });
  write("control/en.json", { "ctl.a": { message: "A, b", description: "Text with a comma." } });
  write("control/hi.json", { "ctl.a": "अ, ब" });
  write("control/ta.json", { "ctl.a": "அ, ஆ" });
  write("terminology/en/ey.json", { "term.learner": "Child" });
  write("terminology/hi/ey.json", { "term.learner": "बच्चा" });
  write("terminology/ta/ey.json", { "term.learner": "குழந்தை" });
  return dir;
}

describe("language review CSV", () => {
  it("round-trips commas, quotes, line breaks and Tamil through CSV", () => {
    const rows: Row[] = [
      {
        catalogue: "app",
        key: "k",
        english: 'Say "hi", then\nleave',
        note: "n",
        hindi: "ह",
        tamil: "த",
        status: "checked",
      },
    ];
    const csv = toCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rowsFromCsv(csv)).toEqual(rows);
    expect(parseCsv('a,"b,c"\r\n')).toEqual([["a", "b,c"]]);
  });

  it("finds placeholders, including plural arguments", () => {
    expect(placeholders("{count, plural, one {# item} other {# items}} for {name}")).toEqual([
      "count",
      "name",
    ]);
    expect(checkTranslation("Hi {name}", "नमस्ते {name}")).toBeNull();
    expect(checkTranslation("Hi {name}", "नमस्ते")).toMatch(/placeholders/);
    expect(checkTranslation("Hi {name}", "नमस्ते {name")).toMatch(/no matching/);
  });

  it("exports every catalogue and writes back only valid, changed translations", () => {
    const dir = fakeI18n();
    const catalogues = loadCatalogues(dir);
    expect(catalogues.map((c) => c.name)).toEqual(["app", "control", "terms:ey"]);
    const rows = exportRows(catalogues);
    expect(rows).toHaveLength(3);

    expect(importRows(catalogues, rows)).toEqual({ changed: [], refused: [] });

    const edited = rows.map((r) =>
      r.key === "common.hello"
        ? { ...r, tamil: "வணக்கம் {name}!", hindi: "नमस्ते!" }
        : r.key === "term.learner"
          ? { ...r, english: "Kid", hindi: "शिशु" }
          : r,
    );
    const result = importRows(catalogues, edited);
    expect(result.changed).toEqual(["app common.hello (tamil)", "terms:ey term.learner (hindi)"]);
    expect(result.refused).toEqual([
      "app common.hello (hindi): placeholders must be {name} but are {}",
    ]);
    const ta = JSON.parse(readFileSync(path.join(dir, "messages/ta.json"), "utf-8"));
    expect(ta["common.hello"]).toBe("வணக்கம் {name}!");
    const en = JSON.parse(readFileSync(path.join(dir, "terminology/en/ey.json"), "utf-8"));
    expect(en["term.learner"]).toBe("Child");
  });
});
