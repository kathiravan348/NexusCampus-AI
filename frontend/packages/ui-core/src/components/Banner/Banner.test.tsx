import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useText } from "@nexus/i18n";
import { Banner } from "./Banner";

function LocalizedSample() {
  const t = useText();
  return (
    <Banner tone="warning" title={t("common.status")}>
      {t("common.demoNotice")}
    </Banner>
  );
}

describe("Banner", () => {
  it("renders role status with info tone by default, title and body", () => {
    render(
      <Banner title="Notice title">
        <span>Notice details</span>
      </Banner>,
    );
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("data-tone", "info");
    expect(banner).toHaveTextContent("Notice title");
    expect(banner).toHaveTextContent("Notice details");
  });

  it("renders warning tone across light, dark, pseudo-locale and RTL", () => {
    const { rerender } = render(
      <div data-theme="light">
        <I18nProvider locale="en">
          <LocalizedSample />
        </I18nProvider>
      </div>,
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Demo data. Nothing on this screen is real.",
    );

    rerender(
      <div data-theme="dark" dir="rtl">
        <I18nProvider locale="en-XA">
          <LocalizedSample />
        </I18nProvider>
      </div>,
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByRole("status").textContent).toContain("⟦");
  });
});
