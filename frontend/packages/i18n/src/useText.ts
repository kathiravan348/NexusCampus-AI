import { useCallback } from "react";
import { useIntl } from "react-intl";
import type { MessageKey } from "./resolve";

/** Values for ICU placeholders, e.g. `{ count: 3 }` for `{count, plural, …}`. */
export type TextValues = Readonly<
  Record<string, string | number | boolean | Date | null | undefined>
>;

export type Translate = (key: MessageKey, values?: TextValues) => string;

/**
 * `const t = useText(); t("common.save")`. Keys are typed against `messages/en.json`, so an
 * unknown key is a compile error. Must be used inside `I18nProvider`.
 */
export function useText(): Translate {
  const intl = useIntl();
  return useCallback<Translate>((key, values) => intl.formatMessage({ id: key }, values), [intl]);
}
