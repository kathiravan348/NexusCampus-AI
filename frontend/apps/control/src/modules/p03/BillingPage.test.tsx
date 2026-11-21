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
    initialEntries: ["/billing"],
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

describe("P03 Billing", () => {
  it("shows invoices with tax schemes and records a bank transfer for an overdue one", async () => {
    renderAt(STAFF.billing);
    const invoices = await screen.findByRole("table", { name: "Invoices" });
    expect(await within(invoices).findByText("INV-2026-00088")).toBeInTheDocument();
    expect(within(invoices).getAllByText(/^GST /).length).toBeGreaterThan(0);
    expect(within(invoices).getByText("No tax")).toBeInTheDocument();
    fireEvent.click(
      within(invoices).getByRole("button", {
        name: "Record a bank transfer for INV-2026-00088",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Record payment" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Our bank reference" }), {
      target: { value: "HDFC-STMT-0915" },
    });
    fireEvent.click(confirm);
    expect(await screen.findByText("Payment recorded")).toBeInTheDocument();
    openTab("Reminders");
    const reminders = await screen.findByRole("table", { name: "Reminders" });
    expect(await within(reminders).findAllByText("No reminders")).toHaveLength(2);
  });

  it("shows payments with gateway references and never card details", async () => {
    renderAt(STAFF.billing);
    await screen.findByRole("table", { name: "Invoices" });
    openTab("Payments");
    const payments = await screen.findByRole("table", { name: "Payments" });
    expect(await within(payments).findAllByText("Razorpay")).not.toHaveLength(0);
    expect(within(payments).getByText("pay_ls-08")).toBeInTheDocument();
  });

  it("lets a super admin read but hides billing from support", async () => {
    renderAt(STAFF.morgan);
    const nav = await screen.findByRole("navigation");
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Billing" })).not.toBeInTheDocument();
  });
});
