import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPhone } from "./format";

/** ICU uses narrow and normal no-break spaces; compare with plain spaces. */
const plain = (s: string) => s.replace(/\s/g, " ");

describe("formatMoney", () => {
  it("formats integer minor units with the currency's own digits", () => {
    expect(formatMoney(125000, "INR", "en-IN")).toBe("₹1,250.00");
    expect(formatMoney(125000, "USD", "en-US")).toBe("$1,250.00");
    expect(formatMoney(1250, "JPY", "ja-JP")).toBe("￥1,250");
  });

  it("uses Indian grouping for large INR amounts", () => {
    expect(formatMoney(1250000000, "INR", "en-IN")).toBe("₹1,25,00,000.00");
  });

  it("handles 3-digit currencies (KWD)", () => {
    expect(formatMoney(12345, "KWD", "en-US")).toMatch(/12\.345/);
  });

  it("refuses non-integer minor units", () => {
    expect(() => formatMoney(12.5, "USD", "en-US")).toThrow(RangeError);
  });
});

describe("formatNumber", () => {
  it("follows the locale's grouping and digits", () => {
    expect(formatNumber(1234567.5, "en-IN")).toBe("12,34,567.5");
    expect(formatNumber(1234567.5, "ar-EG")).toBe("١٬٢٣٤٬٥٦٧٫٥");
  });
});

describe("formatDate", () => {
  it("shows calendar dates as-is, never shifted by a time zone", () => {
    expect(formatDate("2026-11-19", { locale: "en-GB", dateStyle: "long" })).toBe(
      "19 November 2026",
    );
    expect(
      formatDate("2026-11-19", {
        locale: "en-GB",
        dateStyle: "long",
        timeZone: "America/New_York",
      }),
    ).toBe("19 November 2026");
  });

  it("shows timestamps in the institution's time zone", () => {
    const utc = "2026-11-19T04:30:00Z";
    expect(formatDate(utc, { locale: "en-US", timeZone: "America/New_York" })).toBe("Nov 18, 2026");
    expect(formatDate(utc, { locale: "en-IN", timeZone: "Asia/Kolkata" })).toBe("19 Nov 2026");
  });

  it("supports secondary calendars (G-3)", () => {
    const day = "2026-11-19";
    expect(
      formatDate(day, { locale: "en-GB", dateStyle: "long", calendar: "islamic-umalqura" }),
    ).toBe("9 Jumada II 1448 AH");
    expect(formatDate(day, { locale: "en-GB", dateStyle: "long", calendar: "hebrew" })).toBe(
      "9 Kislev 5787",
    );
    expect(formatDate(day, { locale: "en-GB", dateStyle: "long", calendar: "indian" })).toBe(
      "28 Kartika 1948 Śaka",
    );
  });

  it("defaults to the Gregorian calendar even where the locale's default differs", () => {
    expect(formatDate("2026-11-19", { locale: "ar-SA", dateStyle: "long" })).toContain("٢٠٢٦");
  });

  it("rejects invalid dates", () => {
    expect(() => formatDate("not a date", { locale: "en" })).toThrow(RangeError);
  });
});

describe("formatDateTime", () => {
  it("converts UTC to the institution's time zone", () => {
    expect(
      plain(formatDateTime("2026-11-19T04:30:00Z", { locale: "en-IN", timeZone: "Asia/Kolkata" })),
    ).toBe("19 Nov 2026, 10:00 am");
    expect(
      plain(
        formatDateTime("2026-11-19T04:30:00Z", { locale: "en-US", timeZone: "America/New_York" }),
      ),
    ).toBe("Nov 18, 2026, 11:30 PM");
  });
});

describe("formatPhone", () => {
  it("splits the calling code and groups the rest", () => {
    expect(formatPhone("+919876543210")).toBe("+91 987 654 3210");
    expect(formatPhone("+14155552671")).toBe("+1 415 555 2671");
    expect(formatPhone("+971501234567")).toBe("+971 501 234 567");
    expect(formatPhone("+447911123456")).toBe("+44 791 112 3456");
  });

  it("returns anything that is not E.164 unchanged", () => {
    for (const raw of ["9876543210", "+0123456789", "+91 98765 43210", ""])
      expect(formatPhone(raw)).toBe(raw);
  });
});
