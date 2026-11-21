import { ACCOUNT, STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(path: string, staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: [path] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
  return router;
}

const table = () => screen.findByRole("table", { name: "Customer accounts" });

describe("P01 Accounts & CRM", () => {
  it("lists every account for sales and filters by delivery model and name", async () => {
    renderAt("/accounts", STAFF.sales);
    expect(
      await within(await table()).findByRole("link", { name: "Riverside Education Group" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Delivery model" }), {
      target: { value: "self_hosted" },
    });
    expect(
      await within(await table()).findByRole("link", { name: "Alpine Skills Academy" }),
    ).toBeInTheDocument();
    expect(
      within(await table()).queryByRole("link", { name: "Apex Coaching" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search accounts" }), {
      target: { value: "coastal" },
    });
    expect(
      await within(await table()).findByRole("link", { name: "Coastal Institute of Technology" }),
    ).toBeInTheDocument();
    expect(
      within(await table()).queryByRole("link", { name: "Alpine Skills Academy" }),
    ).not.toBeInTheDocument();
  });

  it("shows only the partner's own accounts to a partner user", async () => {
    renderAt("/accounts", STAFF.partnerUser);
    const rows = within(await table());
    expect(await rows.findByRole("link", { name: "Apex Coaching" })).toBeInTheDocument();
    expect(rows.getByRole("link", { name: "Lotus Coaching Centre" })).toBeInTheDocument();
    expect(rows.queryByRole("link", { name: "Riverside Education Group" })).not.toBeInTheDocument();
  });

  it("opens an account with its summary, tabs, owner and partner names", async () => {
    renderAt(`/accounts/${ACCOUNT.apex}`, STAFF.sales);
    expect(await screen.findByRole("heading", { name: "Apex Coaching" })).toBeInTheDocument();
    expect(await screen.findByText("Arjun Mehta", { selector: "dd" })).toBeInTheDocument();
    expect(await screen.findByText("Southern EdTech Partners")).toBeInTheDocument();
    const contacts = await screen.findByRole("table", { name: "Contacts" });
    expect(await within(contacts).findByText("Karthik Subramanian")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Contracts" }));
    fireEvent.click(screen.getByRole("tab", { name: "Contracts" }));
    const contracts = await screen.findByRole("table", { name: "Contracts" });
    expect(await within(contracts).findByText("SaaS subscription")).toBeInTheDocument();
  });

  it("adds a note as sales; a partner user can only read notes", async () => {
    renderAt(`/accounts/${ACCOUNT.harmony}`, STAFF.sales);
    const tab = await screen.findByRole("tab", { name: "Notes" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(await screen.findByText(/Trial usage is low/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "New note" }), {
      target: { value: "Booked a teacher training call for Friday." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(
      await screen.findByText("Booked a teacher training call for Friday."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Note added")).toBeInTheDocument();
  });

  it("tells a partner user that an account outside their partner does not exist for them", async () => {
    renderAt(`/accounts/${ACCOUNT.riverside}`, STAFF.partnerUser);
    expect(
      await screen.findByText("This account does not exist or you cannot see it."),
    ).toBeInTheDocument();
  });

  it("is not in the menu for a release manager", async () => {
    renderAt("/", STAFF.release);
    const nav = await screen.findByRole("navigation");
    await screen.findByRole("heading", { name: "Welcome, Lena Fischer" });
    expect(within(nav).queryByRole("link", { name: "Accounts" })).not.toBeInTheDocument();
  });
});
