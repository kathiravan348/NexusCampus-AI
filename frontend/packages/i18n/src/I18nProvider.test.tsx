import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./I18nProvider";
import { useText } from "./useText";

function Probe() {
  const t = useText();
  return (
    <>
      <button type="button">{t("common.save")}</button>
      <p>{t("term.learners")}</p>
      <p>{t("common.syncPending", { count: 2 })}</p>
    </>
  );
}

function TypedKeysOnly() {
  const t = useText();
  // @ts-expect-error unknown keys are a compile error (useText is typed against en.json)
  return <span>{t("common.saev")}</span>;
}

afterEach(() => {
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
});

describe("I18nProvider + useText", () => {
  it("renders English with the institution type's terms", () => {
    render(
      <I18nProvider locale="en-IN" typePack="ey">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("Children")).toBeInTheDocument();
    expect(screen.getByText("2 changes waiting to sync")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("renders Tamil and Hindi with their plural rules and terms (D42)", () => {
    const { unmount } = render(
      <I18nProvider locale="ta-IN" typePack="ey">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "சேமி" })).toBeInTheDocument();
    expect(screen.getByText("குழந்தைகள்")).toBeInTheDocument();
    expect(screen.getByText("2 மாற்றங்கள் ஒத்திசைக்கக் காத்திருக்கின்றன")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("ta-IN");
    unmount();
    render(
      <I18nProvider locale="hi-IN" typePack="ey">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "सहेजें" })).toBeInTheDocument();
    expect(screen.getByText("बच्चे")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("hi-IN");
  });

  it("keeps right-to-left support for a locale without a catalogue (English fallback)", () => {
    render(
      <I18nProvider locale="ur-PK" typePack="ey">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("applies institution overrides and pseudo-localises in en-XA", () => {
    render(
      <I18nProvider locale="en-XA" institution={{ "common.save": "Keep" }}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button").textContent).toMatch(/^⟦Ķééþ·+⟧$/);
    expect(screen.getByText(/⟦2 çĥáñĝéš/)).toBeInTheDocument();
  });

  it("reports keys that fall back to English", () => {
    const onMissing = vi.fn();
    render(
      <I18nProvider locale="fr" onMissing={onMissing}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(onMissing).toHaveBeenCalledWith(
      expect.objectContaining({ key: "common.save", locale: "fr" }),
    );
  });

  it("is type-safe: unknown keys only exist behind @ts-expect-error", () => {
    expect(TypedKeysOnly).toBeTypeOf("function");
  });
});
