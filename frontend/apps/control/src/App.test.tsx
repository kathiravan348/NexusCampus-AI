import { describe, expect, it } from "vitest";
import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Building2 } from "lucide-react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ControlProviders } from "./App";
import { CONTROL_LOCALE_KEY } from "./app/ControlRuntime";
import type { ControlModuleEntry } from "./app/modules";
import { controlRoutes } from "./app/router";

/** Test-only page: needs `ctl.account.read` (sales, billing, support, … have it; release manager does not). */
const ACCOUNTS_PAGE: ControlModuleEntry = {
  moduleId: "P01",
  path: "accounts",
  navKey: "ctl.role.sales",
  summaryKey: "ctl.home.intro",
  icon: Building2,
  permission: "ctl.account.read",
  load: () => Promise.resolve({ default: () => <p>accounts page</p> }),
};

function renderAt(path: string, staffId: string | null = null) {
  if (staffId) sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes([ACCOUNTS_PAGE]), { initialEntries: [path] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
  return router;
}

describe("Nexus Control app", () => {
  it("sends signed-out visitors to the demo sign-in and signs in as the picked staff member", async () => {
    renderAt("/");
    const pick = await screen.findByRole("button", { name: "Sign in as Farah Khan" });
    expect(screen.getByRole("heading", { name: "Sign in to Nexus Control" })).toBeInTheDocument();
    fireEvent.click(pick);
    expect(await screen.findByRole("heading", { name: "Welcome, Farah Khan" })).toBeInTheDocument();
    expect(screen.getByText("Roles: Billing")).toBeInTheDocument();
    expect(screen.getByText("Demo data. Nothing on this screen is real.")).toBeInTheDocument();
  });

  it("shows a page in the menu and on home only with its permission", async () => {
    renderAt("/", STAFF.billing);
    const nav = await screen.findByRole("navigation");
    expect(await within(nav).findByRole("link", { name: "Sales" })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("link", { name: "Sales" }));
    expect(await screen.findByText("accounts page")).toBeInTheDocument();
  });

  it("hides the page and blocks its URL without the permission", async () => {
    renderAt("/accounts", STAFF.release);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(screen.queryByText("accounts page")).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation");
    expect(within(nav).queryByRole("link", { name: "Sales" })).not.toBeInTheDocument();
  });

  it("switches the language to Tamil and remembers it", async () => {
    renderAt("/", STAFF.morgan);
    const select = await screen.findByRole("combobox", { name: "Language" });
    fireEvent.change(select, { target: { value: "ta" } });
    expect(await screen.findByText(/பொறுப்புகள்: உதவி/)).toBeInTheDocument();
    expect(localStorage.getItem(CONTROL_LOCALE_KEY)).toBe("ta");
  });

  it("signs out back to the sign-in page", async () => {
    const router = renderAt("/", STAFF.admin);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in to Nexus Control" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(sessionStorage.getItem(CONTROL_STAFF_KEY)).toBeNull();
  });

  it("signs out a staff id the server does not know", async () => {
    renderAt("/", "stf-9999");
    expect(
      await screen.findByRole("heading", { name: "Sign in to Nexus Control" }),
    ).toBeInTheDocument();
  });
});
