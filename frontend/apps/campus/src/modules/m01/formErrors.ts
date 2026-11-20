import type { DisplayCalendar, InstitutionType, Region, AcademicStructure } from "@nexus/contracts";
import type { MessageKey } from "@nexus/i18n";
import { ApiRequestError } from "@nexus/services";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** Maps server `invalid_request` details (`path` + `message`) onto React Hook Form fields. */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): boolean {
  if (!(error instanceof ApiRequestError) || !error.error.details?.length) return false;
  let mapped = false;
  for (const detail of error.error.details) {
    if (!detail.path) continue;
    setError(detail.path as Path<T>, { type: "server", message: detail.message });
    mapped = true;
  }
  return mapped;
}

export const COMMON_LOCALES: readonly string[] = [
  "en",
  "en-IN",
  "en-GB",
  "en-US",
  "en-SG",
  "fr-FR",
  "de-DE",
  "es-ES",
  "hi-IN",
  "ta-IN",
];

export const COMMON_TIME_ZONES: readonly string[] = [
  "UTC",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Australia/Sydney",
];

export const COMMON_CURRENCIES: readonly string[] = [
  "INR",
  "GBP",
  "USD",
  "EUR",
  "AED",
  "SAR",
  "SGD",
  "AUD",
  "JPY",
  "KWD",
];

export const COMMON_COUNTRIES: readonly string[] = [
  "IN",
  "GB",
  "US",
  "AE",
  "SA",
  "SG",
  "FR",
  "DE",
  "ES",
  "AU",
];

export function withExtras(
  base: readonly string[],
  extras: readonly (string | null | undefined)[],
): string[] {
  const out = [...base];
  for (const item of extras) {
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

export const TYPE_KEY: Readonly<Record<InstitutionType, MessageKey>> = {
  ey: "m01.type.ey",
  k12: "m01.type.k12",
  he: "m01.type.he",
  voc: "m01.type.voc",
  tp: "m01.type.tp",
  sk: "m01.type.sk",
  onl: "m01.type.onl",
  grp: "m01.type.grp",
};

export const REGION_KEY: Readonly<Record<Region, MessageKey>> = {
  in: "m01.region.in",
  eu: "m01.region.eu",
  us: "m01.region.us",
  me: "m01.region.me",
  apac: "m01.region.apac",
};

export const STRUCTURE_KEY: Readonly<Record<AcademicStructure, MessageKey>> = {
  terms: "m01.structureKind.terms",
  semesters: "m01.structureKind.semesters",
  trimesters: "m01.structureKind.trimesters",
  rolling: "m01.structureKind.rolling",
};

export const DISPLAY_CALENDAR_KEY: Readonly<Record<DisplayCalendar, MessageKey>> = {
  gregory: "m01.calendar.display.gregory",
  "islamic-umalqura": "m01.calendar.display.islamicUmalqura",
  hebrew: "m01.calendar.display.hebrew",
  indian: "m01.calendar.display.indian",
};

export const WEEKDAY_KEYS: readonly MessageKey[] = [
  "m01.weekday.sun",
  "m01.weekday.mon",
  "m01.weekday.tue",
  "m01.weekday.wed",
  "m01.weekday.thu",
  "m01.weekday.fri",
  "m01.weekday.sat",
];
