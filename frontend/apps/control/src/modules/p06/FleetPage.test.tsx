import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: ["/fleet"] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P06 Fleet", () => {
  it("summarises health and lists every deployment", async () => {
    renderAt(STAFF.lindqvist);
    const table = await screen.findByRole("table", { name: "Deployments" });
    expect(await within(table).findByText("IN shared cell 1 (Mumbai)")).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(8);
    expect(within(table).getByText("Air-gapped — never checks in")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Fleet health" });
    expect(within(summary).getByText("5 deployments")).toBeInTheDocument();
  });

  it("shows a check-in with counts only, and none for the air-gapped install", async () => {
    renderAt(STAFF.lindqvist);
    const table = await screen.findByRole("table", { name: "Deployments" });
    fireEvent.click(
      await within(table).findByRole("button", {
        name: "Show the latest check-in of APAC shared cell 1 (Singapore)",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Latest check-in: APAC shared cell 1 (Singapore)",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1.8 %")).toBeInTheDocument();
    expect(screen.getByText(/never personal data/)).toBeInTheDocument();
    fireEvent.click(
      within(table).getByRole("button", {
        name: "Show the latest check-in of Alpine Skills Academy (air-gapped)",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Latest check-in: Alpine Skills Academy (air-gapped)",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("1.8 %")).not.toBeInTheDocument();
  });
});
