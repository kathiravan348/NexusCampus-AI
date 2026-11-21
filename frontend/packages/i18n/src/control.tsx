import { useCallback, useLayoutEffect, useMemo, type ReactNode } from "react";
import { IntlProvider, useIntl } from "react-intl";
import controlEn from "../control/en.json";
import controlHi from "../control/hi.json";
import controlTa from "../control/ta.json";
import { applyDirection } from "./direction";
import { pseudoLocalize } from "./pseudo";
import {
  SOURCE_LOCALE,
  baseLanguage,
  isPseudoLocale,
  resolveMessages,
  type MessageKey,
} from "./resolve";
import type { TextValues } from "./useText";

/**
 * Nexus Control texts (D53): their own catalogue, loaded only by `apps/control`. Institutions cannot override them,
 * and they never ship in the campus bundle. `common.*` platform texts are available too (shared components).
 */
export type ControlMessageKey = keyof typeof controlEn;

export const CONTROL_MESSAGE_KEYS = Object.keys(controlEn) as ControlMessageKey[];

export const CONTROL_LOCALES = ["en", "hi", "ta"] as const;

const CATALOGS: Readonly<Record<string, Readonly<Partial<Record<string, string>>>>> = {
  hi: controlHi,
  ta: controlTa,
};

/** English source text and translator descriptions of the Control catalogue. */
export const CONTROL_SOURCE: Readonly<
  Record<ControlMessageKey, { message: string; description: string }>
> = controlEn;

/** Every message the Control app needs in `locale`: platform texts plus the Control catalogue (English fallback). */
export function controlMessages(locale: string): Readonly<Record<string, string>> {
  const pseudo = isPseudoLocale(locale);
  const catalog = pseudo ? undefined : CATALOGS[baseLanguage(locale)];
  const own: Record<string, string> = {};
  for (const key of CONTROL_MESSAGE_KEYS) {
    const source = controlEn[key].message;
    own[key] = pseudo ? pseudoLocalize(source) : (catalog?.[key] ?? source);
  }
  return { ...resolveMessages({ locale }), ...own };
}

export interface ControlI18nProviderProps {
  readonly locale: string;
  readonly children: ReactNode;
}

/** Texts for the Control app and `<html lang dir>` for the locale. */
export function ControlI18nProvider({ locale, children }: ControlI18nProviderProps) {
  const messages = useMemo(() => controlMessages(locale), [locale]);
  useLayoutEffect(() => {
    applyDirection(locale);
  }, [locale]);
  const intlLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  return (
    <IntlProvider locale={intlLocale} defaultLocale={SOURCE_LOCALE} messages={messages}>
      {children}
    </IntlProvider>
  );
}

export type ControlTranslate = (key: ControlMessageKey | MessageKey, values?: TextValues) => string;

/** `const t = useControlText(); t("ctl.signIn.title", { product })` — Control and platform keys, typed. */
export function useControlText(): ControlTranslate {
  const intl = useIntl();
  return useCallback<ControlTranslate>(
    (key, values) => intl.formatMessage({ id: key }, values),
    [intl],
  );
}
