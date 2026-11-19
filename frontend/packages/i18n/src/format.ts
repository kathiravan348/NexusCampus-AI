/**
 * Locale-correct formatting (G-1, G-2, G-3), all through `Intl`. Screens never format dates, numbers
 * or money themselves (AGENTS.md §6).
 */

/** Calendars an institution may show next to (or instead of) the Gregorian one (G-3). */
export type DisplayCalendar = "gregory" | "islamic-umalqura" | "hebrew" | "indian";

export interface DateOptions {
  locale: string;
  /** IANA zone of the institution, e.g. `Asia/Kolkata`. Ignored for calendar dates (`YYYY-MM-DD`). */
  timeZone?: string;
  calendar?: DisplayCalendar;
  dateStyle?: "full" | "long" | "medium" | "short";
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

/**
 * Formats a calendar date (`YYYY-MM-DD`, shown as-is, never shifted by a time zone) or a UTC
 * timestamp (shown in `timeZone`).
 */
export function formatDate(value: string | Date, options: DateOptions): string {
  const calendarDate = typeof value === "string" && CALENDAR_DATE.test(value);
  const date = toDate(calendarDate ? `${value}T00:00:00Z` : value);
  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: options.dateStyle ?? "medium",
    timeZone: calendarDate ? "UTC" : (options.timeZone ?? "UTC"),
    calendar: options.calendar ?? "gregory",
  }).format(date);
}

/** Formats a UTC timestamp (ISO-8601 with `Z`) as date and time in the institution's time zone. */
export function formatDateTime(
  value: string | Date,
  options: Omit<DateOptions, "dateStyle"> & { timeZone: string },
): string {
  return new Intl.DateTimeFormat(options.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: options.timeZone,
    calendar: options.calendar ?? "gregory",
  }).format(toDate(value));
}

export function formatNumber(
  value: number,
  locale: string,
  options?: Omit<Intl.NumberFormatOptions, "style" | "currency">,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats money held as integer minor units (D9): `formatMoney(125000, "INR", "en-IN")` → `₹1,250.00`.
 * The number of minor-unit digits comes from `Intl` (JPY 0, INR 2, KWD 3).
 */
export function formatMoney(minor: number, currency: string, locale: string): string {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Money must be an integer number of minor units, got ${minor}`);
  }
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minor / 10 ** digits);
}

/** Calling codes with 1 or 2 digits; every other code has 3 (ITU E.164 assignments). */
const ONE_DIGIT_CODES = new Set(["1", "7"]);
const TWO_DIGIT_CODES = new Set(
  (
    "20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 " +
    "60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98"
  ).split(" "),
);

const E164 = /^\+[1-9]\d{6,14}$/;

function group(digits: string): string {
  const parts: string[] = [];
  let rest = digits;
  while (rest.length > 4) {
    parts.push(rest.slice(0, 3));
    rest = rest.slice(3);
  }
  parts.push(rest);
  return parts.join(" ");
}

/**
 * Lightweight display of an E.164 number (`+919876543210` → `+91 987 654 3210`): splits off the
 * calling code and groups the rest. JS `Intl` has no phone formatter; national formats need a
 * metadata library later. Input that is not E.164 is returned unchanged.
 */
export function formatPhone(e164: string): string {
  if (!E164.test(e164)) return e164;
  const digits = e164.slice(1);
  const codeLength = ONE_DIGIT_CODES.has(digits.slice(0, 1))
    ? 1
    : TWO_DIGIT_CODES.has(digits.slice(0, 2))
      ? 2
      : 3;
  return `+${digits.slice(0, codeLength)} ${group(digits.slice(codeLength))}`;
}
