import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient, setMockScenario } from "@nexus/services";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { MODULES } from "../../app/modules";
import { freshDb, persona, renderApp, signInAs } from "../../test/renderApp";
import { SetupPage } from "./SetupPage";

function switchTab(name: string | RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

function renderSetupDirectly() {
  signInAs(persona(TENANT.riverside, "admin"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <SetupPage />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("SetupPage (M01)", () => {
  afterEach(() => {
    setMockScenario(null);
    vi.restoreAllMocks();
  });

  it("renders all 4 tabs for K12 (Riverside) and shows both campuses", async () => {
    renderApp("/setup", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Institution setup" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(await within(main).findByText("K–12 school")).toBeInTheDocument();
    expect(within(main).getByText("Europe (EU)")).toBeInTheDocument();

    switchTab("Structure");
    expect(await within(main).findByText("Riverside Education Group")).toBeInTheDocument();
    expect(within(main).getByText("Riverside School North")).toBeInTheDocument();
    expect(within(main).getByText("Riverside School South")).toBeInTheDocument();

    switchTab("Locale & formats");
    expect(await within(main).findByTestId("preview-money")).toHaveTextContent("£1,234.56");

    switchTab("Calendar");
    expect(await within(main).findByDisplayValue("Autumn term")).toBeInTheDocument();
  });

  it("renders all 4 tabs for HE (Northbridge)", async () => {
    renderApp("/setup", { as: persona(TENANT.northbridge, "admin"), modules: MODULES });
    const main = await screen.findByRole("main");
    expect(await within(main).findByText("Higher education")).toBeInTheDocument();
    expect(await within(main).findByText("Semesters")).toBeInTheDocument();

    switchTab("Structure");
    expect(await within(main).findByText("Northbridge University")).toBeInTheDocument();

    switchTab("Locale & formats");
    expect(await within(main).findByTestId("preview-money")).toHaveTextContent("$1,234.56");

    switchTab("Calendar");
    expect(await within(main).findByDisplayValue("Fall 2026")).toBeInTheDocument();
  });

  it("renders Apex in Arabic RTL with the Hijri display calendar", async () => {
    renderApp("/setup", { as: persona(TENANT.apex, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "إعداد المؤسسة" }),
    ).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");

    switchTab("التقويم");
    expect(await screen.findByLabelText("تقويم العرض")).toHaveValue("islamic-umalqura");
  });

  it("hides the menu item for Teacher and shows Forbidden by URL", async () => {
    renderApp("/", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    expect(await screen.findByRole("heading", { level: 1, name: /Welcome/ })).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation")[0]!;
    expect(within(nav).queryByRole("link", { name: "Institution setup" })).not.toBeInTheDocument();

    renderApp("/setup", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("shows error EmptyState with retry in the error scenario", async () => {
    setMockScenario("error");
    renderSetupDirectly();
    expect(
      await screen.findByRole("heading", { name: "Could not load institution setup." }),
    ).toBeInTheDocument();

    setMockScenario(null);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Institution setup" }),
    ).toBeInTheDocument();
  });

  it("shows L0 offline notice in RouteGuard and disables save in SetupPage when offline", async () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderApp("/setup", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "Needs a connection" })).toBeInTheDocument();

    spy.mockReturnValue(true);
    renderSetupDirectly();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Institution setup" }),
    ).toBeInTheDocument();
    switchTab("Locale & formats");
    const saveBtn = await screen.findByRole("button", { name: "Save" });
    expect(saveBtn).toBeEnabled();

    spy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText(/You are offline/)).toBeInTheDocument();
    expect(saveBtn).toBeDisabled();
  });
});
