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

  it("renders Arabic right-to-left with Arabic plural rules and terms", () => {
    render(
      <I18nProvider locale="ar-SA" typePack="ey">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "حفظ" })).toBeInTheDocument();
    expect(screen.getByText("الأطفال")).toBeInTheDocument();
    expect(screen.getByText("تغييران بانتظار المزامنة")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar-SA");
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
