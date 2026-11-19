import { I18nProvider } from "@nexus/i18n";
import { checkTheme, DEFAULT_COLORS } from "@nexus/ui-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContrastPanel } from "./ContrastPanel";

describe("ContrastPanel", () => {
  it("shows passing status when there are no failures", () => {
    render(
      <I18nProvider locale="en">
        <ContrastPanel
          failures={[]}
          effectiveColors={DEFAULT_COLORS}
          lockedTokens={new Set()}
          onApplySuggestion={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(
      screen.getByText("All contrast pairs meet WCAG 2.2 AA requirements."),
    ).toBeInTheDocument();
  });

  it("lists failing pairs with ratios and invokes suggestion callback", () => {
    const onApply = vi.fn();
    const brokenLight = {
      ...DEFAULT_COLORS.light,
      "brand-primary": "#FDE047",
      "on-brand": "#FFFFFF",
    };
    const failures = checkTheme({ light: brokenLight });
    expect(failures.length).toBeGreaterThan(0);

    render(
      <I18nProvider locale="en">
        <ContrastPanel
          failures={failures}
          effectiveColors={{ light: brokenLight, dark: DEFAULT_COLORS.dark }}
          lockedTokens={new Set()}
          onApplySuggestion={onApply}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/on-brand on brand-primary/)).toBeInTheDocument();
    expect(screen.getByText(/requires at least 4\.5:1/)).toBeInTheDocument();
    const suggestionButtons = screen.getAllByRole("button", { name: /Use suggestion/ });
    fireEvent.click(suggestionButtons[0]!);
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
