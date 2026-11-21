import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";
import { reasonKey } from "./labels";

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/analytics"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P16 Analytics", () => {
  it("shows the latest month, 12 months and AI customer health sorted by risk", async () => {
    renderAt(STAFF.sales);
    expect(await screen.findByRole("heading", { name: "August 2026" })).toBeInTheDocument();
    expect(screen.getByText("Annual recurring revenue")).toBeInTheDocument();
    expect(screen.getAllByText("418").length).toBeGreaterThan(1);
    expect(screen.getByText("+2% from last month")).toBeInTheDocument();

    const months = screen.getByRole("table", { name: "Last 12 months" });
    expect(within(months).getAllByRole("row")).toHaveLength(13);

    const health = await screen.findByRole("table", { name: "Customer health (AI estimate)" });
    const rows = await within(health).findAllByRole("row");
    expect(rows).toHaveLength(8);
    expect(within(rows[1]!).getByText("High")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/Low usage; Trial ends soon/)).toBeInTheDocument();
    expect(screen.getByText(/a person decides whether to act/)).toBeInTheDocument();
  });

  it("falls back for an unknown reason and is hidden from the release manager", async () => {
    expect(reasonKey("p16.reason.somethingNew")).toBe("p16.reason.other");
    renderAt(STAFF.release);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
