import { createIntl } from "react-intl";
import { describe, expect, it } from "vitest";
import { pseudoLocalize } from "./pseudo";

const format = (message: string, values: Record<string, string | number>) =>
  createIntl({ locale: "en", messages: { m: message } }).formatMessage({ id: "m" }, values);

describe("pseudoLocalize", () => {
  it("wraps, accents and makes text about 40 % longer", () => {
    const out = pseudoLocalize("Save changes");
    expect(out.startsWith("⟦")).toBe(true);
    expect(out.endsWith("⟧")).toBe(true);
    expect(out).toContain("Šáṽé çĥáñĝéš");
    expect(out.length).toBeGreaterThanOrEqual(Math.round("Save changes".length * 1.4));
  });

  it("keeps simple placeholders working", () => {
    const out = pseudoLocalize("Hello {name}");
    expect(out).toContain("{name}");
    expect(format(out, { name: "Asha" })).toContain("Asha");
  });

  it("keeps plural syntax and # but accents the branch text", () => {
    const source = "{count, plural, one {# change waiting} other {# changes waiting}}";
    const out = pseudoLocalize(source);
    expect(out).toContain("{count, plural, one {# çĥáñĝé ŵáíţíñĝ} other {# çĥáñĝéš ŵáíţíñĝ}}");
    expect(format(out, { count: 1 })).toContain("1 çĥáñĝé ŵáíţíñĝ");
    expect(format(out, { count: 5 })).toContain("5 çĥáñĝéš ŵáíţíñĝ");
  });

  it("copies number and date arguments verbatim", () => {
    const out = pseudoLocalize("Paid {amount, number} on {day, date, medium}");
    expect(out).toContain("{amount, number}");
    expect(out).toContain("{day, date, medium}");
    expect(out).toContain("Þáíð");
  });

  it("never drops text after a stray closing brace", () => {
    expect(pseudoLocalize("Done } then more")).toContain("Ðóñé } ţĥéñ ɱóŕé");
  });

  it("leaves ICU-quoted text alone", () => {
    expect(pseudoLocalize("Use '{'braces'}'")).toContain("'{'");
  });
});
