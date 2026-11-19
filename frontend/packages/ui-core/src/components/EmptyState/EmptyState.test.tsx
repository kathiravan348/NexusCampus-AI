import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@nexus/i18n";
import { EmptyState } from "./EmptyState";

function renderWithI18n(ui: React.ReactElement, locale = "en") {
  return render(<I18nProvider locale={locale}>{ui}</I18nProvider>);
}

describe("EmptyState", () => {
  it("renders default localized title when title is omitted", () => {
    renderWithI18n(<EmptyState />);
    expect(screen.getByRole("heading", { name: "Nothing here yet" })).toBeInTheDocument();
  });

  it("renders error alert role and default error title when tone is error", () => {
    renderWithI18n(
      <EmptyState
        tone="error"
        icon={<span data-testid="err-icon" />}
        description="Retry shortly"
        action={<button type="button">Try again</button>}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("Retry shortly")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders Arabic defaults when locale is ar", () => {
    renderWithI18n(<EmptyState />, "ar");
    expect(screen.getByRole("heading", { name: "لا توجد عناصر بعد" })).toBeInTheDocument();
  });
});
