import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@nexus/i18n";
import { DemoBanner } from "./DemoBanner";

function renderWithI18n(ui: React.ReactElement, locale = "en") {
  return render(<I18nProvider locale={locale}>{ui}</I18nProvider>);
}

describe("DemoBanner", () => {
  it("renders role note with default localized demo notice", () => {
    renderWithI18n(<DemoBanner />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Demo data. Nothing on this screen is real.",
    );
  });

  it("renders Arabic default notice in ar locale", () => {
    renderWithI18n(<DemoBanner />, "ar");
    expect(screen.getByRole("note")).toHaveTextContent(
      "بيانات تجريبية. لا شيء على هذه الشاشة حقيقي.",
    );
  });

  it("renders custom children when provided", () => {
    renderWithI18n(<DemoBanner>Sandbox mode</DemoBanner>);
    expect(screen.getByRole("note")).toHaveTextContent("Sandbox mode");
  });
});
