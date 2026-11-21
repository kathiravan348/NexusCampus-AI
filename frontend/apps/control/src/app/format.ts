import { formatDate, formatMoney, formatNumber, isPseudoLocale, SOURCE_LOCALE } from "@nexus/i18n";
import { useMemo } from "react";
import { useControlRuntime } from "./ControlRuntime";

/** Formatters in the staff member's language (dates, numbers, money via `@nexus/i18n`, AGENTS §6). */
export function useControlFormat() {
  const { locale } = useControlRuntime();
  return useMemo(() => {
    const intl = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
    return {
      date: (value: string) => formatDate(value, { locale: intl, dateStyle: "medium" }),
      number: (value: number) => formatNumber(value, intl),
      money: (minor: number, currency: string) => formatMoney(minor, currency, intl),
    };
  }, [locale]);
}
