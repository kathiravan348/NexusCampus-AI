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
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: ["/staff"] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P13 Staff", () => {
  it("lists staff with roles and multi-factor login, and states the no-access rule", async () => {
    renderAt(STAFF.okafor);
    const table = await screen.findByRole("table", { name: "Staff" });
    expect(await within(table).findByText("Suresh Babu")).toBeInTheDocument();
    expect(within(table).getByText("Partner user")).toBeInTheDocument();
    expect(within(table).getAllByText("Enrolled")).toHaveLength(9);
    expect(within(table).getByText("Security officer, Support")).toBeInTheDocument();
    expect(screen.getByText(/No role can read an institution's data/)).toBeInTheDocument();
  });

  it("is hidden from sales", async () => {
    renderAt(STAFF.sales);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
