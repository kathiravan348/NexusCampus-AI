import {
  LOCALE_CATALOGS,
  MESSAGE_KEYS,
  SOURCE_MESSAGES,
  TERMINOLOGY,
  isValidMessage,
} from "@nexus/i18n/resolve";

/** Hand-picked ICU edge cases: what the backend parser must accept or refuse exactly like formatjs. */
const ICU_EDGE_CASES: readonly string[] = [
  "",
  "Plain text",
  "Hello {name}",
  "{ name }",
  "{}",
  "{ }",
  "{name",
  "name}",
  "{a}{b}",
  "{0}",
  "{n, number}",
  "{n, number, integer}",
  "{n, number, percent}",
  "{n, number, ::currency/INR}",
  "{n, number,}",
  "{d, date}",
  "{d, date, short}",
  "{d, time, ::hhmm}",
  "{n, duration}",
  "{n, spellout}",
  "{n, plural, one {# item} other {# items}}",
  "{n, plural, =0 {none} one {one} other {#}}",
  "{n, plural, offset:1 one {x} other {y}}",
  "{n, plural, one {x}}",
  "{n, plural, one {x} one {y} other {z}}",
  "{n, plural, other {x}",
  "{n, plural,}",
  "{n, plural other {x}}",
  "{n, plural, one x other {y}}",
  "{n, plural, =x {a} other {b}}",
  "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
  "{g, select, female {She} male {He} other {They}}",
  "{g, select, female {She}}",
  "{g, select, a {{n, plural, one {#} other {# many}}} other {x}}",
  "# outside plural",
  "{g, select, a {#} other {b}}",
  "It''s fine",
  "It's fine",
  "'{literal}'",
  "'{unclosed",
  "a '' b",
  "Use '{' and '}'",
  "a } b",
  "<b>bold</b>",
  "<b>bold",
  "</b>",
  "<b>x</i>",
  "a < b",
  "<br/>",
  "<b>{n, plural, one {#} other {#}}</b>",
  "{n, plural, one {<b>#</b>} other {#}}",
  "{a, foo}",
  "{a b}",
  "{a, select, other {x}} tail",
  "{a, plural, one {{b}} other {}}",
  "x {a, select, other {y} z",
  "சொல் {name}",
  "नमस्ते {name}, {n, plural, one {# संदेश} other {# संदेश}}",
];

const allCatalogueMessages = (): string[] => {
  const texts = new Set<string>(Object.values(SOURCE_MESSAGES));
  for (const catalog of Object.values(LOCALE_CATALOGS)) {
    for (const text of Object.values(catalog)) if (text !== undefined) texts.add(text);
  }
  for (const packs of Object.values(TERMINOLOGY)) {
    for (const pack of Object.values(packs)) {
      for (const text of Object.values(pack)) if (text !== undefined) texts.add(text);
    }
  }
  return [...texts].sort();
};

/** Known message keys (`backend/src/nexus/modules/m04/message_keys.json`, NEX-054). */
export function messageKeysJson(): string {
  return `${JSON.stringify([...MESSAGE_KEYS].sort(), null, 2)}\n`;
}

/** formatjs verdicts for the backend ICU parity test (`backend/tests/m04/icu_cases.json`, NEX-054). */
export function icuCasesJson(): string {
  const cases = [...ICU_EDGE_CASES, ...allCatalogueMessages()].map((text) => ({
    text,
    valid: isValidMessage(text),
  }));
  return `${JSON.stringify(cases, null, 2)}\n`;
}
