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
    initialEntries: ["/releases"],
  });
  render(
    <ControlProviders
      createClient={() => new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </ControlProviders>,
  );
}

const releasesTable = () => screen.findByRole("table", { name: "Releases" });

describe("P07 Releases", () => {
  it("publishes an AI-noted draft only after a person reviews the notes", async () => {
    renderAt(STAFF.release);
    const table = await releasesTable();
    fireEvent.click(await within(table).findByRole("button", { name: "Sign and publish 2.5.0" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Sign and publish" });
    expect(confirm).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "I reviewed the AI-drafted release notes" }),
    );
    fireEvent.click(confirm);
    expect(await screen.findByText("Release signed and published")).toBeInTheDocument();
    expect(
      within(await releasesTable()).queryByRole("button", { name: "Sign and publish 2.5.0" }),
    ).not.toBeInTheDocument();
  });

  it("starts the next pending ring of 2.4.1", async () => {
    renderAt(STAFF.release);
    const table = await releasesTable();
    fireEvent.click(await within(table).findByRole("button", { name: "Show details of 2.4.1" }));
    expect(await screen.findByRole("heading", { name: "Release 2.4.1" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Start ring 2" }));
    expect(await screen.findByText("Ring rolled out")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start ring 2" })).not.toBeInTheDocument();
  });

  it("lets support read releases without publishing or starting rings", async () => {
    renderAt(STAFF.morgan);
    const table = await releasesTable();
    fireEvent.click(await within(table).findByRole("button", { name: "Show details of 2.4.1" }));
    await screen.findByRole("heading", { name: "Release 2.4.1" });
    expect(screen.queryByRole("button", { name: /Sign and publish/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start ring/ })).not.toBeInTheDocument();
  });
});
