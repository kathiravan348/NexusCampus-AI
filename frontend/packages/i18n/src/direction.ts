import { baseLanguage } from "./resolve";

export type Direction = "ltr" | "rtl";

/** Languages written right-to-left (G-1). */
const RTL_LANGUAGES: ReadonlySet<string> = new Set([
  "ar",
  "he",
  "fa",
  "ur",
  "ps",
  "sd",
  "ug",
  "yi",
  "dv",
  "ckb",
]);

export function getDirection(locale: string): Direction {
  return RTL_LANGUAGES.has(baseLanguage(locale)) ? "rtl" : "ltr";
}

/** Sets `<html lang dir>` so the browser, screen readers and CSS logical properties follow the locale. */
export function applyDirection(locale: string, doc: Document = document): Direction {
  const dir = getDirection(locale);
  doc.documentElement.lang = locale;
  doc.documentElement.dir = dir;
  return dir;
}
