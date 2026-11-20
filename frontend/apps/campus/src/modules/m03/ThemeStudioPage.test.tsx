import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient, setMockScenario } from "@nexus/services";
import { TENANT_THEME_STYLE_ID } from "@nexus/ui-core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { MODULES } from "../../app/modules";
import { withInstitutionLocale, freshDb, persona, renderApp, signInAs } from "../../test/renderApp";
import { ThemeStudioPage } from "./ThemeStudioPage";

function renderStudioDirectly(as = persona(TENANT.northbridge, "admin")) {
  signInAs(as);
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ThemeStudioPage />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("ThemeStudioPage (M03)", () => {
  afterEach(() => {
    setMockScenario(null);
    vi.restoreAllMocks();
  });

  it("updates preview only while editing, blocks save on contrast failure, fixes via suggestion, resets and saves", async () => {
    renderApp("/theme", { as: persona(TENANT.northbridge, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Theme studio" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.getByText("Version 1")).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeDisabled();

    // Edit brand-primary to bright yellow: preview updates, outer app style unchanged, contrast blocks save
    const primaryInput = await screen.findByRole("textbox", { name: /^brand-primary$/i });
    const appStyleBefore = document.getElementById(TENANT_THEME_STYLE_ID)?.textContent ?? "";
    fireEvent.change(primaryInput, { target: { value: "#FDE047" } });

    expect(screen.getByTestId("theme-preview-style").textContent).toContain(
      "--brand-primary: #FDE047;",
    );
    expect(document.getElementById(TENANT_THEME_STYLE_ID)?.textContent ?? "").toBe(appStyleBefore);
    expect(screen.getByText(/contrast issues? block/i)).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();

    // Apply brand pair suggestions, then resolve remaining brand-primary contrast failure via ContrastPanel
    fireEvent.click(screen.getByRole("button", { name: "Apply suggestions" }));
    while (screen.queryAllByRole("button", { name: /Use suggestion/ }).length > 0) {
      fireEvent.click(screen.getAllByRole("button", { name: /Use suggestion/ })[0]!);
    }

    expect(
      screen.getByText("All contrast pairs meet WCAG 2.2 AA requirements."),
    ).toBeInTheDocument();
    expect(saveBtn).toBeEnabled();

    // Reset brand-accent after changing it to verify per-token reset
    const accentInput = screen.getByRole("textbox", { name: /^brand-accent$/i });
    fireEvent.change(accentInput, { target: { value: "#0E7490" } });
    expect(accentInput).toHaveValue("#0E7490");
    fireEvent.click(screen.getByRole("button", { name: "Reset brand-accent to platform default" }));
    expect(accentInput).toHaveValue("#0D9488");

    // Save: applies to app, bumps version badge to Version 2, and displays success toast
    fireEvent.click(saveBtn);
    expect(await screen.findByText("Theme saved (version 2).")).toBeInTheDocument();
    expect(await screen.findByText("Version 2")).toBeInTheDocument();
  });

  it("locks brand-primary as read-only for Riverside institution admin with group lock reason", async () => {
    renderApp("/theme", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Theme studio" }),
    ).toBeInTheDocument();

    const primaryInput = await screen.findByRole("textbox", { name: /^brand-primary(\s|$)/i });
    expect(primaryInput).toBeDisabled();
    expect(screen.getByText("Locked by group")).toBeInTheDocument();
    expect(screen.getByText(/Locked by the group theme/)).toBeInTheDocument();
  });

  it("renders in Tamil for Apex admin and hides route from teachers", async () => {
    withInstitutionLocale(TENANT.apex);
    renderApp("/theme", { as: persona(TENANT.apex, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "தீம் ஸ்டுடியோ" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ta-IN");

    renderApp("/", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    expect(await screen.findByRole("heading", { level: 1, name: /Welcome/ })).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation")[0]!;
    expect(within(nav).queryByRole("link", { name: "Theme studio" })).not.toBeInTheDocument();

    renderApp("/theme", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("keeps L1 screen open offline but disables Save with an offline notice", async () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderStudioDirectly();
    const primaryInput = await screen.findByRole("textbox", { name: /^brand-primary$/i });
    fireEvent.change(primaryInput, { target: { value: "#0F5132" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply suggestions" }));
    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect(saveBtn).toBeEnabled();

    spy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText(/You are offline/)).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();

    spy.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("shows error EmptyState with retry in the error scenario", async () => {
    setMockScenario("error");
    renderStudioDirectly();
    expect(
      await screen.findByRole("heading", { name: "Could not load theme settings." }),
    ).toBeInTheDocument();

    setMockScenario(null);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Theme studio" }),
    ).toBeInTheDocument();
  });
});
