import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: ["/moves"] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P18 Moves", () => {
  it("shows each move with direction, regions and its seven steps", async () => {
    renderAt(STAFF.implementation);
    expect(
      await screen.findByRole("heading", { name: "Coastal Institute of Technology" }),
    ).toBeTruthy();
    const done = screen.getByRole("list", { name: "Steps of move mov-ct" });
    expect(within(done).getAllByText("Done")).toHaveLength(7);

    const running = screen.getByRole("list", { name: "Steps of move mov-rv" });
    expect(within(running).getByText("Pre-flight check")).toBeInTheDocument();
    expect(within(running).getAllByText("Running")).toHaveLength(1);
    expect(within(running).getAllByText("Waiting")).toHaveLength(6);
    expect(screen.getByText(/SaaS → self-hosted · Europe \(EU\) · started/)).toBeInTheDocument();
    expect(screen.getByText(/SaaS → self-hosted · India \(IN\) · started/)).toBeInTheDocument();
    expect(screen.getByText(/encrypted with the tenant's own keys/)).toBeInTheDocument();
  });

  it("is hidden from billing", async () => {
    renderAt(STAFF.billing);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
