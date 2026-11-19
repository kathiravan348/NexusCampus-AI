import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { DEFAULT_COLORS, DEFAULT_FONTS, DEFAULT_RADIUS } from "@nexus/ui-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { ThemePreview } from "./ThemePreview";

describe("ThemePreview", () => {
  it("renders scoped tenant CSS variables and sample controls without touching html", async () => {
    signInAs(persona(TENANT.northbridge, "admin"));
    const onModeChange = vi.fn();
    render(
      <AppProviders
        db={freshDb()}
        createClient={() =>
          createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <ThemePreview
            theme={{
              light: { ...DEFAULT_COLORS.light, "brand-primary": "#0F5132" },
              dark: DEFAULT_COLORS.dark,
              fonts: DEFAULT_FONTS,
              radius: DEFAULT_RADIUS,
              density: "comfortable",
            }}
            mode="light"
            onModeChange={onModeChange}
            tenantName="Northbridge University"
            logoUrl="/demo/northbridge/logo.svg"
          />
        </MemoryRouter>
      </AppProviders>,
    );

    const styleEl = await screen.findByTestId("theme-preview-style");
    expect(styleEl.textContent).toContain("--brand-primary: #0F5132;");
    expect(styleEl.textContent).toContain("data-theme-preview");
    expect(styleEl.textContent).not.toContain("html:root");

    expect(screen.getByRole("button", { name: "Primary action" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByLabelText("Sample field")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(onModeChange).toHaveBeenCalledWith("dark");
  });
});
