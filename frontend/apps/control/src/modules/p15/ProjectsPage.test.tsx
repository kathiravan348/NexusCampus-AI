import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/projects"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

describe("P15 Projects", () => {
  it("lists projects with checklists, progress and AI-draft marks, filtered by status", async () => {
    renderAt(STAFF.implementation);
    expect(await screen.findByRole("heading", { name: "Sunrise Montessori" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    expect(screen.getByText("3 of 3 tasks done")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 tasks done")).toBeInTheDocument();
    expect(screen.getAllByText("AI draft — check before sharing")).toHaveLength(2);
    expect(screen.getByText("Invite teachers and import families")).toBeInTheDocument();
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "live" },
    });
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1));
    expect(screen.getByText(/Self-hosted install/)).toBeInTheDocument();
  });

  it("is hidden from the release manager", async () => {
    renderAt(STAFF.release);
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
