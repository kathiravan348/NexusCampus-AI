import { STAFF } from "@nexus/mocks/control";
import { CONTROL_STAFF_KEY } from "@nexus/services/control";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ControlProviders } from "../../App";
import { CONTROL_MODULES } from "../../app/modules";
import { controlRoutes } from "../../app/router";

function renderAt(staffId: string) {
  sessionStorage.setItem(CONTROL_STAFF_KEY, staffId);
  const router = createMemoryRouter(controlRoutes(CONTROL_MODULES), {
    initialEntries: ["/licences"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

const card = async (name: string) => {
  const heading = await screen.findByRole("heading", { name });
  const root = heading.closest("section, article, div[class*='rounded']");
  if (!(root instanceof HTMLElement)) throw new Error(`no card for ${name}`);
  return within(root);
};

afterEach(() => vi.restoreAllMocks());

describe("P05 Licences", () => {
  it("shows the learners meter for a reporting install and 'not reported' for the air-gapped one", async () => {
    renderAt(STAFF.admin);
    const coastal = await card("Coastal Institute of Technology");
    expect(await coastal.findByRole("meter", { name: "Learners" })).toHaveAttribute(
      "aria-valuetext",
      "4,180 of 4,200",
    );
    const alpine = await card("Alpine Skills Academy");
    expect(alpine.getByText(/Usage not reported/)).toBeInTheDocument();
    expect(alpine.getByText("Perpetual")).toBeInTheDocument();
  });

  it("renews a term licence by a year and downloads the signed file", async () => {
    const created = vi.fn(() => "blob:licence");
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderAt(STAFF.implementation);
    const coastal = await card("Coastal Institute of Technology");
    expect(coastal.getAllByText("Mar 31, 2027")).toHaveLength(2);
    fireEvent.click(
      coastal.getByRole("button", { name: "Renew Coastal Institute of Technology for a year" }),
    );
    expect(await screen.findByText(/Licence renewed/)).toBeInTheDocument();
    expect((await coastal.findAllByText("Mar 31, 2028")).length).toBeGreaterThan(0);
    fireEvent.click(
      coastal.getByRole("button", {
        name: "Download the licence file for Coastal Institute of Technology",
      }),
    );
    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    expect(created).toHaveBeenCalled();
  });

  it("shows support staff the licences without renew or download", async () => {
    renderAt(STAFF.morgan);
    await screen.findByRole("heading", { name: "Coastal Institute of Technology" });
    expect(screen.queryByRole("button", { name: /Renew/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
  });
});
