import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { createIntl } from "react-intl";
import { pseudoLocalize } from "./pseudo";
import {
  isPseudoLocale,
  resolveKey,
  SOURCE_LOCALE,
  type MessageExplanation,
  type MessageKey,
  type ResolveOptions,
} from "./resolve";

export type { MessageExplanation, MessageLayer } from "./resolve";
export { MESSAGE_LAYERS } from "./resolve";

/**
 * Returns each layer's text (or `null`) and which layer wins for `key`.
 * Reuses `resolveKey` (the same internal logic as `resolveMessages`) with no duplicated resolution.
 */
export function explainMessage(key: MessageKey, options: ResolveOptions): MessageExplanation {
  return resolveKey(key, options);
}

export type MessagePreviewResult =
  | { readonly ok: true; readonly rendered: string; readonly placeholders: readonly string[] }
  | { readonly ok: false; readonly error: string };

function collectSampleValues(
  nodes: readonly MessageFormatElement[],
  out: Record<string, string | number | Date>,
): void {
  for (const node of nodes) {
    if (node.type === TYPE.number || node.type === TYPE.plural) {
      out[node.value] = 3;
      if (node.type === TYPE.plural) {
        for (const opt of Object.values(node.options)) collectSampleValues(opt.value, out);
      }
    } else if (node.type === TYPE.date || node.type === TYPE.time) {
      out[node.value] = new Date("2026-06-15T09:30:00Z");
    } else if (node.type === TYPE.select) {
      out[node.value] = Object.keys(node.options)[0] ?? "other";
      for (const opt of Object.values(node.options)) collectSampleValues(opt.value, out);
    } else if (node.type === TYPE.argument) {
      out[node.value] = `[${node.value}]`;
    }
  }
}

/**
 * Renders an ICU message string for in-context preview using sample placeholder values.
 * Returns `{ ok: false, error }` when the ICU syntax is invalid.
 */
export function formatMessagePreview(text: string, locale: string): MessagePreviewResult {
  let ast: MessageFormatElement[];
  try {
    ast = parse(text);
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Invalid ICU message",
    };
  }
  const values: Record<string, string | number | Date> = {};
  collectSampleValues(ast, values);
  const pseudo = isPseudoLocale(locale);
  const intlLocale = pseudo ? SOURCE_LOCALE : locale;
  try {
    const intl = createIntl({
      locale: intlLocale,
      defaultLocale: SOURCE_LOCALE,
      messages: { preview: text },
    });
    const formatted = intl.formatMessage({ id: "preview" }, values);
    return {
      ok: true,
      rendered: pseudo ? pseudoLocalize(formatted) : formatted,
      placeholders: Object.keys(values),
    };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Invalid ICU message",
    };
  }
}
