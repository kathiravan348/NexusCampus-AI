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
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: ["/trust"] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P14 Trust", () => {
  it("shows certifications, the breach clock, sub-processors and customer agreements", async () => {
    renderAt(STAFF.okafor);
    expect(await screen.findByText("ISO/IEC 27001")).toBeInTheDocument();
    expect(screen.getByText("Certified")).toBeInTheDocument();

    const incidents = await screen.findByRole("table", { name: "Security incidents" });
    expect(
      await within(incidents).findByText("Report-card email sent to the wrong parent group"),
    ).toBeInTheDocument();
    expect(within(incidents).getByText(/Notified .*, on time/)).toBeInTheDocument();
    expect(within(incidents).getAllByText("No personal data affected")).toHaveLength(2);
    expect(within(incidents).getAllByText(/AI-drafted report/)).toHaveLength(2);

    const subs = screen.getByRole("table", { name: "Sub-processors" });
    expect(await within(subs).findByText("Amazon Web Services")).toBeInTheDocument();
    expect(within(subs).getByText("Institution data (hosting)")).toBeInTheDocument();
    expect(within(subs).getAllByText("Our business data only")).toHaveLength(2);

    const dpas = screen.getByRole("table", { name: "Customer data agreements" });
    expect(await within(dpas).findAllByRole("row")).toHaveLength(5);
  });

  it("is hidden from sales", async () => {
    renderAt(STAFF.sales);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
