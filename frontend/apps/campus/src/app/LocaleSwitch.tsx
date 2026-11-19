import { applyDirection, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { Select } from "@nexus/ui-core";
import { useMemo } from "react";
import { useRuntime } from "./TenantRuntime";

/** A locale's own-language name shown in the current locale (CLDR data, not app text). */
export function localeName(code: string, displayLocale: string): string {
  try {
    const display = isPseudoLocale(displayLocale) ? SOURCE_LOCALE : displayLocale;
    return new Intl.DisplayNames([display], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Language picker: the institution's supported locales (plus the pseudo-locale in dev). */
export function LocaleSwitch() {
  const t = useText();
  const { locale, supportedLocales, setLocale } = useRuntime();
  const options = useMemo(
    () => supportedLocales.map((code) => ({ value: code, label: localeName(code, locale) })),
    [supportedLocales, locale],
  );
  if (options.length < 2) return null;
  return (
    <Select
      label={t("m04.localeSwitch.label")}
      options={options}
      value={locale}
      onChange={(event) => {
        const next = event.target.value;
        applyDirection(next);
        setLocale(next);
      }}
    />
  );
}
