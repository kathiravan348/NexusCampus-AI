import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getStoredTheme } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset["theme"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getStoredTheme", () => {
    it("returns 'light' by default when no theme is stored", () => {
      expect(getStoredTheme()).toBe("light");
    });

    it("returns the stored theme", () => {
      localStorage.setItem("nexus-theme", "dark");
      expect(getStoredTheme()).toBe("dark");
      localStorage.setItem("nexus-theme", "light");
      expect(getStoredTheme()).toBe("light");
    });

    it("returns 'light' when the stored value is invalid", () => {
      localStorage.setItem("nexus-theme", "solarized");
      expect(getStoredTheme()).toBe("light");
    });

    it("returns 'light' when localStorage throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("Access denied");
      });
      expect(getStoredTheme()).toBe("light");
    });
  });

  describe("applyTheme", () => {
    it("sets data-theme on <html> and stores the choice", () => {
      applyTheme("dark");
      expect(document.documentElement.dataset["theme"]).toBe("dark");
      expect(localStorage.getItem("nexus-theme")).toBe("dark");

      applyTheme("light");
      expect(document.documentElement.dataset["theme"]).toBe("light");
      expect(localStorage.getItem("nexus-theme")).toBe("light");
    });

    it("sets data-theme even if localStorage throws", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Quota exceeded");
      });
      applyTheme("dark");
      expect(document.documentElement.dataset["theme"]).toBe("dark");
    });
  });
});
