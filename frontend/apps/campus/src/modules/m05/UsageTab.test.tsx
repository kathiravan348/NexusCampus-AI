import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient, setMockScenario } from "@nexus/services";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { freshDb, persona, renderApp, signInAs } from "../../test/renderApp";
import { UsageTab } from "./UsageTab";

describe("UsageTab", () => {
  afterEach(() => setMockScenario(null));

  it("shows a warning-tone AI meter at 95 % with an accessible value", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.apex]: "en-IN" }));
    renderApp("/plan", { as: persona(TENANT.apex, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Usage" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const ai = await screen.findByRole("meter", { name: "AI credits" });
    expect(ai).toHaveAttribute("aria-valuetext", "475 of 500");
    expect(ai).toHaveAttribute("data-tone", "warning");
    expect(screen.getByText(/GB of/)).toBeInTheDocument();
    expect(screen.getAllByText(/· Unlimited/).length).toBeGreaterThan(0);
  });

  it("shows an empty state when no usage is returned", async () => {
    signInAs(persona(TENANT.littleSteps, "admin"));
    setMockScenario("empty");
    render(
      <AppProviders
        db={freshDb()}
        createClient={() =>
          createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <UsageTab />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(await screen.findByText("No usage recorded this period.")).toBeInTheDocument();
  });
});
