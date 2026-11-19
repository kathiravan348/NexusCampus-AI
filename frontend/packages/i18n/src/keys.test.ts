import { createIntl } from "react-intl";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import { INSTITUTION_TYPES, LOCALE_CATALOGS, MESSAGE_KEYS, TERMINOLOGY } from "./resolve";

const KEY_PATTERN = /^(common|term|[mp]\d{2})\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/;

describe("message keys", () => {
  it("follow <module>.<screen>.<element>, common.<element> or term.<concept>", () => {
    for (const key of MESSAGE_KEYS) expect(key, key).toMatch(KEY_PATTERN);
  });

  it("give translators a description for every English message", () => {
    for (const key of MESSAGE_KEYS) expect(en[key].description.length, key).toBeGreaterThan(10);
  });

  it("are all translated in Arabic, with no extra keys", () => {
    expect(Object.keys(ar).sort()).toEqual([...MESSAGE_KEYS].sort());
  });

  it("have a terminology pack for every institution type in every locale", () => {
    for (const locale of ["en", "ar"]) {
      for (const type of INSTITUTION_TYPES) {
        const pack = TERMINOLOGY[locale]?.[type];
        expect(pack, `${locale}/${type}`).toBeDefined();
        expect(Object.keys(pack ?? {}).sort(), `${locale}/${type}`).toEqual(
          MESSAGE_KEYS.filter((k) => k.startsWith("term.")).sort(),
        );
      }
    }
  });

  it("are valid ICU messages in every catalogue", () => {
    const catalogs: Record<string, Record<string, string | undefined>> = {
      en: Object.fromEntries(MESSAGE_KEYS.map((k) => [k, en[k].message])),
      ...LOCALE_CATALOGS,
    };
    for (const [locale, messages] of Object.entries(catalogs)) {
      const errors: string[] = [];
      const intl = createIntl({
        locale,
        messages: messages as Record<string, string>,
        onError: (e) => errors.push(e.message),
      });
      for (const key of MESSAGE_KEYS) intl.formatMessage({ id: key }, { count: 3 });
      expect(errors, locale).toEqual([]);
    }
  });
});
