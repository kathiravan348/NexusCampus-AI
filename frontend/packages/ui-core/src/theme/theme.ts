export type ThemeName = "light" | "dark";

const STORAGE_KEY = "nexus-theme";

/** The user's light/dark choice; light is the default (D7). */
export function getStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch {
    // localStorage may be unavailable or restricted
  }
  return "light";
}

export function applyTheme(name: ThemeName): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset["theme"] = name;
  }
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // localStorage may be unavailable or restricted
  }
}
