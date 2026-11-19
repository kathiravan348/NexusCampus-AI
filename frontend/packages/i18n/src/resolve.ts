import en from "../messages/en.json";
import ar from "../messages/ar.json";
import enEy from "../terminology/en/ey.json";
import enK12 from "../terminology/en/k12.json";
import enHe from "../terminology/en/he.json";
import enVoc from "../terminology/en/voc.json";
import enTp from "../terminology/en/tp.json";
import enSk from "../terminology/en/sk.json";
import enOnl from "../terminology/en/onl.json";
import enGrp from "../terminology/en/grp.json";
import arEy from "../terminology/ar/ey.json";
import arK12 from "../terminology/ar/k12.json";
import arHe from "../terminology/ar/he.json";
import arVoc from "../terminology/ar/voc.json";
import arTp from "../terminology/ar/tp.json";
import arSk from "../terminology/ar/sk.json";
import arOnl from "../terminology/ar/onl.json";
import arGrp from "../terminology/ar/grp.json";
import { pseudoLocalize } from "./pseudo";

/** Every message key the platform knows; `en.json` is the source of truth (D8). */
export type MessageKey = keyof typeof en;
export type Messages = Readonly<Record<MessageKey, string>>;
/** Tenant text overrides for one locale: message key → ICU message. */
export type TextOverrides = Readonly<Record<string, string>>;

export const INSTITUTION_TYPES = ["ey", "k12", "he", "voc", "tp", "sk", "onl", "grp"] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const SOURCE_LOCALE = "en";
export const PSEUDO_LOCALE = "en-XA";

type Catalog = Readonly<Partial<Record<string, string>>>;

export const MESSAGE_KEYS = Object.keys(en) as MessageKey[];
const KEY_SET: ReadonlySet<string> = new Set(MESSAGE_KEYS);

export const SOURCE_MESSAGES: Messages = Object.fromEntries(
  MESSAGE_KEYS.map((key) => [key, en[key].message]),
) as Record<MessageKey, string>;

/** Translations by base language. `en` is the source and needs no catalog. */
export const LOCALE_CATALOGS: Readonly<Record<string, Catalog>> = { ar };

/** Terminology packs per base language and institution type (C-2); locale-scoped (D28). */
export const TERMINOLOGY: Readonly<Record<string, Readonly<Record<InstitutionType, Catalog>>>> = {
  en: { ey: enEy, k12: enK12, he: enHe, voc: enVoc, tp: enTp, sk: enSk, onl: enOnl, grp: enGrp },
  ar: { ey: arEy, k12: arK12, he: arHe, voc: arVoc, tp: arTp, sk: arSk, onl: arOnl, grp: arGrp },
};

export interface MissingMessage {
  key: string;
  locale: string;
  /** `fallback-to-en`: the locale has no text for the key, so English is shown. `unknown-key`: an override names a key that does not exist, so it is ignored. */
  reason: "fallback-to-en" | "unknown-key";
}

export interface ResolveOptions {
  /** BCP 47 locale, e.g. `ar-SA`; `en-XA` is the pseudo-locale. */
  locale: string;
  typePack?: InstitutionType;
  group?: TextOverrides;
  institution?: TextOverrides;
  campus?: TextOverrides;
  onMissing?: (missing: MissingMessage) => void;
}

export function isPseudoLocale(locale: string): boolean {
  return locale.toLowerCase() === PSEUDO_LOCALE.toLowerCase();
}

/** `ar-SA` → `ar`. */
export function baseLanguage(locale: string): string {
  return (locale.split(/[-_]/)[0] ?? locale).toLowerCase();
}

/**
 * The full message set for one screen. Highest layer wins:
 * campus → institution → group → locale terminology pack → locale → `en` terminology pack → `en`.
 * Every key always has a value: a gap falls back to English and is reported, never shown as a raw key.
 */
export function resolveMessages(options: ResolveOptions): Messages {
  const { locale, typePack, onMissing } = options;
  const pseudo = isPseudoLocale(locale);
  const lang = pseudo ? SOURCE_LOCALE : baseLanguage(locale);

  const out: Record<string, string> = { ...SOURCE_MESSAGES };
  if (typePack) Object.assign(out, TERMINOLOGY[SOURCE_LOCALE]?.[typePack]);

  if (lang !== SOURCE_LOCALE) {
    const catalog = LOCALE_CATALOGS[lang] ?? {};
    const pack = typePack ? (TERMINOLOGY[lang]?.[typePack] ?? {}) : {};
    for (const key of MESSAGE_KEYS) {
      const text = pack[key] ?? catalog[key];
      if (text !== undefined) out[key] = text;
      else onMissing?.({ key, locale, reason: "fallback-to-en" });
    }
  }

  for (const layer of [options.group, options.institution, options.campus]) {
    for (const [key, text] of Object.entries(layer ?? {})) {
      if (KEY_SET.has(key)) out[key] = text;
      else onMissing?.({ key, locale, reason: "unknown-key" });
    }
  }

  if (pseudo) {
    for (const key of MESSAGE_KEYS) out[key] = pseudoLocalize(out[key] ?? "");
  }
  return Object.freeze(out) as Messages;
}
