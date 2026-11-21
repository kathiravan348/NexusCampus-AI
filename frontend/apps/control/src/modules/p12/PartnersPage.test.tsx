import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/partners"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P12 Partners", () => {
  it("shows partners with customers, deals and commissions", async () => {
    renderAt(STAFF.admin);
    expect(
      await screen.findByRole("heading", { name: "Southern EdTech Partners" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Apex Coaching, Lotus Coaching Centre")).toBeInTheDocument();
    expect(await screen.findByText(/₹66,816.00 on invoice inv-ax-26/)).toBeInTheDocument();
    expect(screen.getAllByText("Payable").length).toBeGreaterThan(0);
  });

  it("shows a partner user only their own deal registrations", async () => {
    renderAt(STAFF.partnerUser);
    expect(
      await screen.findByRole("heading", { name: "Your deal registrations" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Lotus Coaching Centre · until/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "EuroLearn Solutions" })).not.toBeInTheDocument();
  });
});
