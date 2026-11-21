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
    initialEntries: ["/provisioning"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P04 Provisioning", () => {
  it("shows jobs with their steps, starts a trial tenant and runs its first step", async () => {
    renderAt(STAFF.implementation);
    const steps = await screen.findByRole("list", { name: "Steps of prv-sr" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(5);
    expect(within(steps).getByText("Load starter settings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start trial tenant" }));
    const dialog = await screen.findByRole("dialog", { name: "Start a trial tenant" });
    const account = within(dialog).getByRole("combobox", { name: "Account" });
    await within(account).findByRole("option", { name: "Lotus Coaching Centre" });
    fireEvent.change(account, { target: { value: "acc-lt" } });
    await within(within(dialog).getByRole("combobox", { name: "Plan" })).findByRole("option", {
      name: "Standard",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Provisioning started")).toBeInTheDocument();

    const next = await screen.findByRole("button", { name: "Run the next step of prv-new-1" });
    fireEvent.click(next);
    expect(await screen.findByText(/Tenant ten-new-new-1/)).toBeInTheDocument();
  });

  it("shows the key-destruction certificate of an offboarded customer", async () => {
    renderAt(STAFF.implementation);
    await screen.findByRole("list", { name: "Steps of prv-sr" });
    const tab = screen.getByRole("tab", { name: "Offboarding" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const cert = await screen.findByRole("region", { name: "Key-destruction certificate" });
    expect(within(cert).getByText("nexus-shred-2026")).toBeInTheDocument();
    expect(within(cert).getByText(/key-om-tenant-data/)).toBeInTheDocument();
  });

  it("lets site reliability read jobs without changing them", async () => {
    renderAt(STAFF.lindqvist);
    await screen.findByRole("list", { name: "Steps of prv-sr" });
    expect(screen.queryByRole("button", { name: "Start trial tenant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run the next step/ })).not.toBeInTheDocument();
  });
});
