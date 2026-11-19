import { afterEach, describe, expect, it } from "vitest";
import { applyDirection, getDirection } from "./direction";

afterEach(() => {
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
});

describe("direction", () => {
  it("is rtl for Arabic, Hebrew, Persian and Urdu, in any region", () => {
    for (const locale of ["ar", "ar-SA", "he-IL", "fa", "ur-PK"])
      expect(getDirection(locale)).toBe("rtl");
  });

  it("is ltr for other languages and the pseudo-locale", () => {
    for (const locale of ["en", "en-IN", "hi", "fr-FR", "en-XA"])
      expect(getDirection(locale)).toBe("ltr");
  });

  it("sets <html lang dir>", () => {
    expect(applyDirection("ar-SA")).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar-SA");
    expect(document.documentElement.dir).toBe("rtl");
    applyDirection("en-IN");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
