import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), { initialEntries: ["/usage"] });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P11 Usage", () => {
  it("shows capped usage as meters and uncapped as counts, grouped by account", async () => {
    renderAt(STAFF.billing);
    expect(await screen.findByRole("heading", { name: "Apex Coaching" })).toBeInTheDocument();
    const meters = await screen.findAllByRole("meter");
    expect(meters.some((m) => m.getAttribute("aria-valuetext") === "4,750 of 5,000")).toBe(true);
    expect(screen.getByText("21,400 · no cap")).toBeInTheDocument();
    expect(screen.getAllByText(/Install dep-ct/).length).toBeGreaterThan(0);
  });

  it("filters by metric", async () => {
    renderAt(STAFF.billing);
    await screen.findByRole("heading", { name: "Apex Coaching" });
    fireEvent.change(screen.getByRole("combobox", { name: "Metric" }), {
      target: { value: "storage_gb" },
    });
    expect(
      await screen.findByRole("heading", { name: "Northbridge University" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Apex Coaching" })).not.toBeInTheDocument();
  });
});
