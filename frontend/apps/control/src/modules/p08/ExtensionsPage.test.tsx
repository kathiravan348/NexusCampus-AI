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
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/extensions"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P08 Extensions", () => {
  it("shows each extension with its release checks and AI labels", async () => {
    renderAt(STAFF.release);
    expect(
      await screen.findByRole("heading", { name: "Northbridge credit grading" }),
    ).toBeInTheDocument();
    const checks = await screen.findAllByRole("region", { name: "Release checks" });
    expect(checks).toHaveLength(2);
    const nb = within(checks[0] as HTMLElement);
    expect(await nb.findByText("Works, needs attention")).toBeInTheDocument();
    expect(nb.getByText(/AI-drafted check/)).toBeInTheDocument();
    expect(screen.getAllByText("Compatible").length).toBeGreaterThan(0);
  });

  it("is hidden from billing staff", async () => {
    renderAt(STAFF.billing);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
