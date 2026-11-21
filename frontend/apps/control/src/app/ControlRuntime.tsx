import { ControlI18nProvider } from "@nexus/i18n/control";
import { applyTheme, getStoredTheme, type ThemeName } from "@nexus/ui-core";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** Languages Control ships (D42); the pseudo-locale only in dev builds. */
export const CONTROL_LOCALES: readonly string[] = import.meta.env.DEV
  ? ["en", "hi", "ta", "en-XA"]
  : ["en", "hi", "ta"];

/** Per-browser convenience only (never data): the chosen language. */
export const CONTROL_LOCALE_KEY = "nexus.control.locale";

interface RuntimeValue {
  readonly locale: string;
  readonly setLocale: (locale: string) => void;
  readonly mode: ThemeName;
  readonly setMode: (mode: ThemeName) => void;
}

const RuntimeContext = createContext<RuntimeValue | null>(null);

function storedLocale(): string {
  try {
    const value = localStorage.getItem(CONTROL_LOCALE_KEY);
    return value && CONTROL_LOCALES.includes(value) ? value : "en";
  } catch {
    return "en";
  }
}

/** Language and light/dark for the Control app, plus its texts (D53). */
export function ControlRuntime({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState(storedLocale);
  const [mode, setModeState] = useState<ThemeName>(getStoredTheme);

  const setLocale = useCallback((next: string) => {
    setLocaleState(next);
    try {
      localStorage.setItem(CONTROL_LOCALE_KEY, next);
    } catch {
      // Blocked storage: the choice lasts for this page only.
    }
  }, []);

  const setMode = useCallback((next: ThemeName) => {
    applyTheme(next);
    setModeState(next);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, mode, setMode }),
    [locale, setLocale, mode, setMode],
  );
  return (
    <RuntimeContext.Provider value={value}>
      <ControlI18nProvider locale={locale}>{children}</ControlI18nProvider>
    </RuntimeContext.Provider>
  );
}

export function useControlRuntime(): RuntimeValue {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("useControlRuntime must be used inside ControlRuntime");
  return value;
}
