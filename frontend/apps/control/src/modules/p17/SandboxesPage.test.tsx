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
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/sandboxes"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P17 Sandboxes", () => {
  it("lists demos and staging clones with their data kind, and states the data rule", async () => {
    renderAt(STAFF.sales);
    const table = await screen.findByRole("table", { name: "Sandboxes" });
    expect(await within(table).findByText("Not tied to a customer")).toBeInTheDocument();
    expect(within(table).getAllByText("Sales demo")).toHaveLength(2);
    expect(within(table).getByText("Staging clone")).toBeInTheDocument();
    expect(within(table).getAllByText("Synthetic data")).toHaveLength(2);
    expect(within(table).getByText("Masked copy")).toBeInTheDocument();
    expect(within(table).getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText(/never holds real institution data/)).toBeInTheDocument();
  });

  it("is hidden from billing", async () => {
    renderAt(STAFF.billing);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
