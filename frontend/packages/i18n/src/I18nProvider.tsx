import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { applyDirection } from "./direction";
import {
  SOURCE_LOCALE,
  isPseudoLocale,
  resolveMessages,
  type InstitutionType,
  type MissingMessage,
  type TextOverrides,
} from "./resolve";

export interface I18nProviderProps {
  /** BCP 47 locale of the user, e.g. `en-IN`, `ar-SA`, or the pseudo-locale `en-XA`. */
  locale: string;
  /** Terminology pack of the institution type. */
  typePack?: InstitutionType;
  /** Tenant text overrides for this locale (C-2). */
  group?: TextOverrides;
  institution?: TextOverrides;
  campus?: TextOverrides;
  /** Called for each key that falls back to English or names no known message. */
  onMissing?: (missing: MissingMessage) => void;
  children: ReactNode;
}

/**
 * Gives its children translated, institution-overridable texts (via `useText`) and sets
 * `<html lang dir>` for the locale.
 */
export function I18nProvider({
  locale,
  typePack,
  group,
  institution,
  campus,
  onMissing,
  children,
}: I18nProviderProps) {
  // Latest callback without re-resolving messages when only the callback changes.
  const onMissingRef = useRef(onMissing);
  useLayoutEffect(() => {
    onMissingRef.current = onMissing;
  });

  const messages = useMemo(
    () =>
      resolveMessages({
        locale,
        typePack,
        group,
        institution,
        campus,
        onMissing: (missing) => onMissingRef.current?.(missing),
      }),
    [locale, typePack, group, institution, campus],
  );

  // Layout effect: set `dir` before the browser paints, so Arabic never flashes left-to-right.
  useLayoutEffect(() => {
    applyDirection(locale);
  }, [locale]);

  // Intl has no data for the pseudo-locale; it formats numbers and dates like English.
  const intlLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  return (
    <IntlProvider locale={intlLocale} defaultLocale={SOURCE_LOCALE} messages={messages}>
      {children}
    </IntlProvider>
  );
}
