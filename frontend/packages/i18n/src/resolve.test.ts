import { describe, expect, it, vi } from "vitest";
import { SOURCE_MESSAGES, baseLanguage, resolveMessages, type MissingMessage } from "./resolve";

describe("resolveMessages", () => {
  it("returns English source messages by default", () => {
    expect(resolveMessages({ locale: "en" })).toEqual(SOURCE_MESSAGES);
  });

  it("applies the layers in order: campus → institution → group → locale pack → locale → en pack → en", () => {
    const key = "term.learner";
    // en only
    expect(resolveMessages({ locale: "en" })[key]).toBe("Learner");
    // en pack beats en
    expect(resolveMessages({ locale: "en", typePack: "ey" })[key]).toBe("Child");
    // locale beats en pack (Arabic default term), locale pack beats locale
    expect(resolveMessages({ locale: "ar" })[key]).toBe("متعلم");
    expect(resolveMessages({ locale: "ar", typePack: "ey" })[key]).toBe("طفل");
    // group beats locale pack, institution beats group, campus beats institution
    const group = { [key]: "G" };
    const institution = { [key]: "I" };
    const campus = { [key]: "C" };
    expect(resolveMessages({ locale: "ar", typePack: "ey", group })[key]).toBe("G");
    expect(resolveMessages({ locale: "ar", typePack: "ey", group, institution })[key]).toBe("I");
    expect(resolveMessages({ locale: "ar", typePack: "ey", group, institution, campus })[key]).toBe(
      "C",
    );
  });

  it("never lets an English terminology pack overwrite Arabic", () => {
    for (const type of ["ey", "k12", "he", "voc", "tp", "sk", "onl", "grp"] as const) {
      const messages = resolveMessages({ locale: "ar-SA", typePack: type });
      for (const key of ["term.learner", "term.teacher", "term.class", "term.guardian"] as const) {
        expect(messages[key], `${type} ${key}`).toMatch(/[؀-ۿ]/);
      }
    }
  });

  it("uses the base language for regional locales", () => {
    expect(baseLanguage("ar-SA")).toBe("ar");
    expect(baseLanguage("en_IN")).toBe("en");
    expect(resolveMessages({ locale: "ar-AE" })["common.save"]).toBe("حفظ");
  });

  it("falls back to English and reports each missing key, never returning a raw key", () => {
    const onMissing = vi.fn<(m: MissingMessage) => void>();
    const messages = resolveMessages({ locale: "fr", onMissing });
    expect(messages).toEqual(SOURCE_MESSAGES);
    expect(onMissing).toHaveBeenCalledWith({
      key: "common.save",
      locale: "fr",
      reason: "fallback-to-en",
    });
    for (const [key, text] of Object.entries(messages)) expect(text).not.toBe(key);
  });

  it("ignores and reports overrides for keys that do not exist", () => {
    const onMissing = vi.fn<(m: MissingMessage) => void>();
    const messages = resolveMessages({
      locale: "en",
      institution: { "common.saev": "Store", "common.save": "Store" },
      onMissing,
    });
    expect(messages["common.save"]).toBe("Store");
    expect(Object.keys(messages)).not.toContain("common.saev");
    expect(onMissing).toHaveBeenCalledWith({
      key: "common.saev",
      locale: "en",
      reason: "unknown-key",
    });
  });

  it("pseudo-localises everything, including tenant overrides, for en-XA", () => {
    const messages = resolveMessages({ locale: "en-XA", campus: { "common.save": "Keep" } });
    expect(messages["common.save"]).toMatch(/^⟦Ķééþ·+⟧$/);
    for (const text of Object.values(messages)) expect(text.startsWith("⟦")).toBe(true);
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(resolveMessages({ locale: "en" }))).toBe(true);
  });
});
