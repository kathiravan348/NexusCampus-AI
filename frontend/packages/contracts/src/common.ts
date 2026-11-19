import { z } from "zod";

/** Opaque identifier. Clients never parse or build ids. */
export const IdSchema = z.string().min(1).max(128);
export type Id = z.infer<typeof IdSchema>;

/** Instant in time: ISO-8601 in UTC with `Z` (offsets are rejected). */
export const UtcDateTimeSchema = z.iso.datetime();
export type UtcDateTime = z.infer<typeof UtcDateTimeSchema>;

/** Calendar date `YYYY-MM-DD`, never shifted by a time zone. */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

function isCanonicalLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}

/** BCP 47 locale in canonical form (`en-IN`, `ar-SA`); `en_IN` and `en-in` are rejected. */
export const LocaleSchema = z.string().refine(isCanonicalLocale, {
  message: "Must be a canonical BCP 47 locale, e.g. en-IN",
});
export type Locale = z.infer<typeof LocaleSchema>;

/** `UTC`, or `Area/Location` names in IANA case (`Asia/Kolkata`, `America/Argentina/Buenos_Aires`). */
const IANA_ZONE_NAME = /^(UTC|[A-Z][A-Za-z_]*(\/[A-Z0-9][A-Za-z0-9_+-]*){1,2})$/;

function isTimeZone(value: string): boolean {
  if (!IANA_ZONE_NAME.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** IANA time zone the runtime knows. `Intl.supportedValuesOf` omits `UTC` and aliases, so it is not used. */
export const TimeZoneSchema = z.string().refine(isTimeZone, {
  message: "Must be an IANA time zone, e.g. Asia/Kolkata or UTC",
});
export type TimeZone = z.infer<typeof TimeZoneSchema>;

const CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf("currency"));

/** ISO 4217 currency code (`INR`, `USD`, `KWD`). */
export const CurrencyCodeSchema = z.string().refine((v) => CURRENCIES.has(v), {
  message: "Must be an ISO 4217 currency code, e.g. INR",
});
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
/** Codes that `Intl` names but that are not countries (incl. CLDR pseudo-regions XA/XB). */
const NOT_COUNTRIES: ReadonlySet<string> = new Set(["ZZ", "EU", "EZ", "UN", "QO", "XA", "XB"]);

function isCountryCode(value: string): boolean {
  return (
    /^[A-Z]{2}$/.test(value) && !NOT_COUNTRIES.has(value) && REGION_NAMES.of(value) !== undefined
  );
}

/** ISO 3166-1 alpha-2 country code, upper case (`IN`, `AE`). */
export const CountryCodeSchema = z.string().refine(isCountryCode, {
  message: "Must be an ISO 3166-1 alpha-2 country code, e.g. IN",
});
export type CountryCode = z.infer<typeof CountryCodeSchema>;

/** Money in integer minor units (paise, cents, fils), always with a currency (D9). */
export const MinorUnitsSchema = z.int();
export type MinorUnits = z.infer<typeof MinorUnitsSchema>;

/** Data residency region cell (G-5, D10). */
export const RegionSchema = z.enum(["in", "eu", "us", "me", "apac"]);
export type Region = z.infer<typeof RegionSchema>;

/** Institution types (REQUIREMENTS §3). Must match `INSTITUTION_TYPES` in `@nexus/i18n`. */
export const InstitutionTypeSchema = z.enum(["ey", "k12", "he", "voc", "tp", "sk", "onl", "grp"]);
export type InstitutionType = z.infer<typeof InstitutionTypeSchema>;

/** Module id from docs/MODULES.md: product `M01`–`M99`, Nexus Control `P01`–`P99`. */
export const ModuleIdSchema = z.string().regex(/^[MP](0[1-9]|[1-9]\d)$/, {
  message: "Must be a module id such as M07 or P10",
});
export type ModuleId = z.infer<typeof ModuleIdSchema>;

/** Calendars an institution may display (G-3). Must match `DisplayCalendar` in `@nexus/i18n`. */
export const DisplayCalendarSchema = z.enum(["gregory", "islamic-umalqura", "hebrew", "indian"]);
export type DisplayCalendar = z.infer<typeof DisplayCalendarSchema>;

/** Non-empty display name (institution, campus, period). */
export const NameSchema = z.string().trim().min(1).max(200);
export type Name = z.infer<typeof NameSchema>;

/** Email address. Stored as entered; the server normalises before matching. */
export const EmailSchema = z.email().max(254);
export type Email = z.infer<typeof EmailSchema>;

/** Phone number in E.164 (`+919876543210`): `+`, country code, 7–15 digits in total. */
export const PhoneE164Schema = z.string().regex(/^\+[1-9]\d{6,14}$/, {
  message: "Must be an E.164 phone number, e.g. +919876543210",
});
export type PhoneE164 = z.infer<typeof PhoneE164Schema>;

/** Retention lifecycle of a record (D25, G-6): active → archived (immutable) → crypto-shredded. */
export const RetentionStateSchema = z.enum(["active", "archived", "crypto_shredded"]);
export type RetentionState = z.infer<typeof RetentionStateSchema>;
