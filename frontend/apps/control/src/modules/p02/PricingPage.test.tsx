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
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/pricing"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("P02 Pricing & quotes", () => {
  it("shows catalogue prices for the chosen country", async () => {
    renderAt(STAFF.sales);
    const table = await screen.findByRole("table", { name: "Catalogue" });
    expect(await within(table).findByText("₹49.00 per learner / month")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Prices for" }), {
      target: { value: "DE" },
    });
    expect(await within(table).findByText("€1.70 per learner / month")).toBeInTheDocument();
    expect(within(table).getAllByText("Not sold here").length).toBeGreaterThan(0);
  });

  it("sends an AI-drafted quote only after a person ticks that they checked it", async () => {
    renderAt(STAFF.sales);
    await screen.findByRole("table", { name: "Catalogue" });
    openTab("Quotes");
    const quotes = await screen.findByRole("table", { name: "Quotes" });
    const send = await within(quotes).findByRole("button", { name: "Send quote QUO-2026-00029" });
    fireEvent.click(send);
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Send quote" });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "I checked this AI draft" }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByText("Quote sent")).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Quotes" });
    expect(
      within(table).queryByRole("button", { name: "Send quote QUO-2026-00029" }),
    ).not.toBeInTheDocument();
  });

  it("lets a billing user read quotes but not send them", async () => {
    renderAt(STAFF.billing);
    await screen.findByRole("table", { name: "Catalogue" });
    openTab("Quotes");
    const table = await screen.findByRole("table", { name: "Quotes" });
    expect(await within(table).findByText("QUO-2026-00030")).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /Send quote/ })).not.toBeInTheDocument();
  });
});
