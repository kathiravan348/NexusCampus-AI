import { I18nProvider } from "@nexus/i18n";
import { DEFAULT_COLORS } from "@nexus/ui-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorTokens } from "./ColorTokens";

describe("ColorTokens", () => {
  it("marks locked group tokens read-only with reason and allows resetting unlocked tokens", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const onModeChange = vi.fn();
    const onApplyBrandSuggestion = vi.fn();

    render(
      <I18nProvider locale="en">
        <ColorTokens
          mode="light"
          onModeChange={onModeChange}
          values={{
            ...DEFAULT_COLORS.light,
            "brand-primary": "#1D4ED8",
            "brand-accent": "#B45309",
          }}
          defaults={DEFAULT_COLORS.light}
          lockedTokens={new Set(["brand-primary"])}
          brandSuggestion={{ onBrand: "#141922", brandPrimaryText: "#7F5206" }}
          onChange={onChange}
          onReset={onReset}
          onApplyBrandSuggestion={onApplyBrandSuggestion}
        />
      </I18nProvider>,
    );

    const lockedInput = screen.getByRole("textbox", { name: /^brand-primary(\s|$)/i });
    expect(lockedInput).toBeDisabled();
    expect(screen.getByText(/Locked by the group theme/)).toBeInTheDocument();

    const resetAccent = screen.getByRole("button", {
      name: "Reset brand-accent to platform default",
    });
    fireEvent.click(resetAccent);
    expect(onReset).toHaveBeenCalledWith("brand-accent");

    fireEvent.click(screen.getByRole("button", { name: "Apply suggestions" }));
    expect(onApplyBrandSuggestion).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(onModeChange).toHaveBeenCalledWith("dark");
  });
});
