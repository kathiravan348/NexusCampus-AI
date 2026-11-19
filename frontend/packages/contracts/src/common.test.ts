import { describe, expect, it } from "vitest";
import {
  CountryCodeSchema,
  CurrencyCodeSchema,
  DisplayCalendarSchema,
  IdSchema,
  InstitutionTypeSchema,
  IsoDateSchema,
  LocaleSchema,
  MinorUnitsSchema,
  ModuleIdSchema,
  RegionSchema,
  TimeZoneSchema,
  UtcDateTimeSchema,
} from "./common";
import type { z } from "zod";

const ok = (schema: z.ZodType, values: unknown[]) => {
  for (const v of values) expect(schema.safeParse(v).success, `accepts ${String(v)}`).toBe(true);
};
const bad = (schema: z.ZodType, values: unknown[]) => {
  for (const v of values) expect(schema.safeParse(v).success, `rejects ${String(v)}`).toBe(false);
};

describe("primitives", () => {
  it("Id is a non-empty opaque string", () => {
    ok(IdSchema, ["inst_01", "7f3c"]);
    bad(IdSchema, ["", 42, "x".repeat(129)]);
  });

  it("UtcDateTime requires Z; IsoDate is YYYY-MM-DD", () => {
    ok(UtcDateTimeSchema, ["2026-11-19T04:30:00Z", "2026-11-19T04:30:00.123Z"]);
    bad(UtcDateTimeSchema, ["2026-11-19T10:00:00+05:30", "2026-11-19", "yesterday"]);
    ok(IsoDateSchema, ["2026-11-19"]);
    bad(IsoDateSchema, ["2026-13-01", "19/11/2026", "2026-11-19T00:00:00Z"]);
  });

  it("Locale must be canonical BCP 47", () => {
    ok(LocaleSchema, ["en", "en-IN", "ar-SA", "zh-Hant-TW", "en-XA"]);
    bad(LocaleSchema, ["en_IN", "en-in", "EN", "x", ""]);
  });

  it("TimeZone accepts IANA names in IANA case and UTC", () => {
    ok(TimeZoneSchema, [
      "UTC",
      "Asia/Kolkata",
      "Asia/Calcutta",
      "America/Argentina/Buenos_Aires",
      "Etc/GMT+5",
    ]);
    bad(TimeZoneSchema, ["Mars/Phobos", "asia/kolkata", "utc", "IST", ""]);
  });

  it("Currency is an ISO 4217 code", () => {
    ok(CurrencyCodeSchema, ["INR", "USD", "KWD", "JPY"]);
    bad(CurrencyCodeSchema, ["XYZ", "inr", "RUPEE"]);
  });

  it("Country is an upper-case ISO 3166-1 alpha-2 code", () => {
    ok(CountryCodeSchema, ["IN", "AE", "GB", "US"]);
    bad(CountryCodeSchema, ["in", "IND", "QQ", "ZZ", "EU", "XA", "XB"]);
  });

  it("MinorUnits are safe integers", () => {
    ok(MinorUnitsSchema, [0, 125000, -500]);
    bad(MinorUnitsSchema, [12.5, 2 ** 60, "100"]);
  });

  it("enums and module ids", () => {
    ok(RegionSchema, ["in", "eu", "us", "me", "apac"]);
    bad(RegionSchema, ["IN", "asia"]);
    ok(InstitutionTypeSchema, ["ey", "k12", "he", "voc", "tp", "sk", "onl", "grp"]);
    bad(InstitutionTypeSchema, ["school", "K12"]);
    ok(ModuleIdSchema, ["M01", "M07", "M91", "P18"]);
    bad(ModuleIdSchema, ["M00", "M1", "m07", "X01", "M100"]);
    ok(DisplayCalendarSchema, ["gregory", "islamic-umalqura", "hebrew", "indian"]);
    bad(DisplayCalendarSchema, ["islamic"]);
  });
});
