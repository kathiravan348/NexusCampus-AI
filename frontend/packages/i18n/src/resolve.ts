import en from "../messages/en.json";
import hi from "../messages/hi.json";
import ta from "../messages/ta.json";
import enEy from "../terminology/en/ey.json";
import enK12 from "../terminology/en/k12.json";
import enHe from "../terminology/en/he.json";
import enVoc from "../terminology/en/voc.json";
import enTp from "../terminology/en/tp.json";
import enSk from "../terminology/en/sk.json";
import enOnl from "../terminology/en/onl.json";
import enGrp from "../terminology/en/grp.json";
import hiEy from "../terminology/hi/ey.json";
import hiK12 from "../terminology/hi/k12.json";
import hiHe from "../terminology/hi/he.json";
import hiVoc from "../terminology/hi/voc.json";
import hiTp from "../terminology/hi/tp.json";
import hiSk from "../terminology/hi/sk.json";
import hiOnl from "../terminology/hi/onl.json";
import hiGrp from "../terminology/hi/grp.json";
import taEy from "../terminology/ta/ey.json";
import taK12 from "../terminology/ta/k12.json";
import taHe from "../terminology/ta/he.json";
import taVoc from "../terminology/ta/voc.json";
import taTp from "../terminology/ta/tp.json";
import taSk from "../terminology/ta/sk.json";
import taOnl from "../terminology/ta/onl.json";
import taGrp from "../terminology/ta/grp.json";
import { parse } from "@formatjs/icu-messageformat-parser";
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

/** Translator descriptions for every message key (from `messages/en.json`). */
export const MESSAGE_DESCRIPTIONS: Messages = Object.fromEntries(
  MESSAGE_KEYS.map((key) => [key, en[key].description]),
) as Record<MessageKey, string>;

/** True when `key` is a known message key in the platform catalogue. */
export function isKnownMessageKey(key: string): key is MessageKey {
  return KEY_SET.has(key);
}

/** Translations by base language. `en` is the source and needs no catalog. */
export const LOCALE_CATALOGS: Readonly<Record<string, Catalog>> = { hi, ta };

/** Terminology packs per base language and institution type (C-2); locale-scoped (D28). */
export const TERMINOLOGY: Readonly<Record<string, Readonly<Record<InstitutionType, Catalog>>>> = {
  en: { ey: enEy, k12: enK12, he: enHe, voc: enVoc, tp: enTp, sk: enSk, onl: enOnl, grp: enGrp },
  hi: { ey: hiEy, k12: hiK12, he: hiHe, voc: hiVoc, tp: hiTp, sk: hiSk, onl: hiOnl, grp: hiGrp },
  ta: { ey: taEy, k12: taK12, he: taHe, voc: taVoc, tp: taTp, sk: taSk, onl: taOnl, grp: taGrp },
};

export interface MissingMessage {
  key: string;
  locale: string;
  /**
   * `fallback-to-en`: the locale has no text for the key, so English is shown.
   * `unknown-key`: an override names a key that does not exist, so it is ignored.
   * `invalid-message`: an override is not valid ICU, so it is ignored and the layer below is shown.
   */
  reason: "fallback-to-en" | "unknown-key" | "invalid-message";
}

/** Validates `text` as ICU MessageFormat and returns the parser error message when invalid. */
export function validateMessage(
  text: string,
): { readonly valid: true } | { readonly valid: false; readonly error: string } {
  try {
    parse(text);
    return { valid: true };
  } catch (cause) {
    return {
      valid: false,
      error: cause instanceof Error ? cause.message : "Invalid ICU message",
    };
  }
}

/** True when `text` is valid ICU MessageFormat (react-intl would otherwise show the raw source). */
export function isValidMessage(text: string): boolean {
  return validateMessage(text).valid;
}

export interface ResolveOptions {
  /** BCP 47 locale, e.g. `ta-IN`; `en-XA` is the pseudo-locale. */
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

/** `ta-IN` → `ta`. */
export function baseLanguage(locale: string): string {
  return (locale.split(/[-_]/)[0] ?? locale).toLowerCase();
}

export const MESSAGE_LAYERS = [
  "platform",
  "terminology",
  "group",
  "institution",
  "campus",
] as const;
export type MessageLayer = (typeof MESSAGE_LAYERS)[number];

export interface MessageExplanation {
  readonly key: MessageKey;
  readonly layers: Readonly<Record<MessageLayer, string | null>>;
  readonly winner: MessageLayer;
  readonly resolved: string;
}

/**
 * Resolves a single key across every layer (platform → terminology → group → institution → campus).
 * Shared by both `resolveMessages` and `explainMessage` so resolution logic lives in one place.
 */
export function resolveKey(key: MessageKey, options: ResolveOptions): MessageExplanation {
  const { locale, typePack, onMissing } = options;
  const pseudo = isPseudoLocale(locale);
  const lang = pseudo ? SOURCE_LOCALE : baseLanguage(locale);

  let platform: string | null;
  let terminology: string | null;
  if (lang === SOURCE_LOCALE) {
    platform = SOURCE_MESSAGES[key];
    terminology = typePack ? (TERMINOLOGY[SOURCE_LOCALE]?.[typePack]?.[key] ?? null) : null;
  } else {
    const localeBase = LOCALE_CATALOGS[lang]?.[key];
    const localePack = typePack ? TERMINOLOGY[lang]?.[typePack]?.[key] : undefined;
    if (localeBase !== undefined || localePack !== undefined) {
      platform = localeBase ?? null;
      terminology = localePack ?? null;
    } else {
      onMissing?.({ key, locale, reason: "fallback-to-en" });
      platform = SOURCE_MESSAGES[key];
      terminology = typePack ? (TERMINOLOGY[SOURCE_LOCALE]?.[typePack]?.[key] ?? null) : null;
    }
  }

  const readOverride = (layer: TextOverrides | undefined): string | null => {
    const raw = layer?.[key];
    if (raw === undefined) return null;
    if (!isValidMessage(raw)) {
      onMissing?.({ key, locale, reason: "invalid-message" });
      return null;
    }
    return raw;
  };

  const layers: Record<MessageLayer, string | null> = {
    platform,
    terminology,
    group: readOverride(options.group),
    institution: readOverride(options.institution),
    campus: readOverride(options.campus),
  };

  let winner: MessageLayer = "platform";
  let text = SOURCE_MESSAGES[key];
  for (const layer of MESSAGE_LAYERS) {
    const value = layers[layer];
    if (value !== null) {
      winner = layer;
      text = value;
    }
  }

  return {
    key,
    layers: Object.freeze(layers),
    winner,
    resolved: pseudo ? pseudoLocalize(text) : text,
  };
}

/**
 * The full message set for one screen. Highest layer wins:
 * campus → institution → group → locale terminology pack → locale → `en` terminology pack → `en`.
 * Every key always has a value: a gap falls back to English and is reported, never shown as a raw key.
 */
export function resolveMessages(options: ResolveOptions): Messages {
  const { locale, onMissing } = options;
  for (const layer of [options.group, options.institution, options.campus]) {
    for (const key of Object.keys(layer ?? {})) {
      if (!KEY_SET.has(key)) onMissing?.({ key, locale, reason: "unknown-key" });
    }
  }

  const out: Record<string, string> = {};
  for (const key of MESSAGE_KEYS) {
    out[key] = resolveKey(key, options).resolved;
  }
  return Object.freeze(out) as Messages;
}
