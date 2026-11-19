import type { Font } from "@nexus/contracts";
import { I18nProvider } from "@nexus/i18n";
import { DEFAULT_RADIUS } from "@nexus/ui-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TypographyPanel } from "./TypographyPanel";

const FONTS: readonly Font[] = [
  {
    id: "inter",
    family: "Inter",
    source: "library",
    roles: ["sans"],
    scripts: ["latin"],
    fileUrl: null,
  },
  {
    id: "noto-sans-arabic",
    family: "Noto Sans Arabic",
    source: "library",
    roles: ["sans"],
    scripts: ["arabic"],
    fileUrl: null,
  },
  {
    id: "jetbrains-mono",
    family: "JetBrains Mono",
    source: "library",
    roles: ["mono"],
    scripts: ["latin"],
    fileUrl: null,
  },
];

describe("TypographyPanel", () => {
  it("lets admins choose fonts, density, and radius with validation and reset", () => {
    const onSansFontChange = vi.fn();
    const onMonoFontChange = vi.fn();
    const onDensityChange = vi.fn();
    const onRadiusChange = vi.fn();
    const onRadiusReset = vi.fn();

    render(
      <I18nProvider locale="en">
        <TypographyPanel
          fonts={FONTS}
          sansFont="inter"
          monoFont={null}
          density="comfortable"
          radius={{ ...DEFAULT_RADIUS, "radius-md": "4px" }}
          lockedTokens={new Set(["radius-lg"])}
          onSansFontChange={onSansFontChange}
          onMonoFontChange={onMonoFontChange}
          onDensityChange={onDensityChange}
          onRadiusChange={onRadiusChange}
          onRadiusReset={onRadiusReset}
        />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText("Body and UI font"), {
      target: { value: "noto-sans-arabic" },
    });
    expect(onSansFontChange).toHaveBeenCalledWith("noto-sans-arabic");

    fireEvent.change(screen.getByLabelText("Numbers and code font"), {
      target: { value: "jetbrains-mono" },
    });
    expect(onMonoFontChange).toHaveBeenCalledWith("jetbrains-mono");

    fireEvent.change(screen.getByLabelText("Layout density"), { target: { value: "spacious" } });
    expect(onDensityChange).toHaveBeenCalledWith("spacious");

    const radiusMd = screen.getByRole("textbox", { name: "radius-md" });
    fireEvent.change(radiusMd, { target: { value: "10px" } });
    expect(onRadiusChange).toHaveBeenCalledWith("radius-md", "10px");

    fireEvent.click(screen.getByRole("button", { name: "Reset radius-md to platform default" }));
    expect(onRadiusReset).toHaveBeenCalledWith("radius-md");

    expect(screen.getByRole("textbox", { name: /radius-lg/i })).toBeDisabled();
  });
});
