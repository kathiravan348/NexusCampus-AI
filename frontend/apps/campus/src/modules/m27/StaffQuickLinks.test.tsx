import type { ModuleId } from "@nexus/contracts";
import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { StaffQuickLinks } from "./StaffQuickLinks";

function renderStaffQuickLinks(visibleModuleIds: ReadonlySet<ModuleId>) {
  signInAs(persona(TENANT.northbridge, "teacher"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <div data-testid="quick-links-host">
          <StaffQuickLinks visibleModuleIds={visibleModuleIds} />
        </div>
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("StaffQuickLinks", () => {
  it("shows the available teaching tools with touch targets in a responsive grid", async () => {
    renderStaffQuickLinks(new Set(["M17", "M16", "M20", "M24", "M18"]));

    const nav = await screen.findByRole("navigation", { name: "Quick links" });
    expect(within(nav).getByRole("list")).toHaveClass("grid-cols-1", "sm:grid-cols-2");
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/attendance",
      "/timetable",
      "/gradebook",
      "/messages",
    ]);
    for (const link of links) expect(link).toHaveClass("min-h-11");
  });

  it("omits teaching tools outside the user's navigation", async () => {
    renderStaffQuickLinks(new Set(["M16", "M24"]));

    const nav = await screen.findByRole("navigation", { name: "Quick links" });
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
    expect(within(nav).getByRole("link", { name: "Timetable" })).toBeVisible();
    expect(within(nav).getByRole("link", { name: "Messages & notices" })).toBeVisible();
  });

  it("renders nothing when no teaching tools are visible", async () => {
    renderStaffQuickLinks(new Set(["M18"]));

    expect(await screen.findByTestId("quick-links-host")).toBeEmptyDOMElement();
  });
});
