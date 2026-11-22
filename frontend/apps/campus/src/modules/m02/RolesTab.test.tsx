import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openRoles() {
  renderApp("/access", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Roles" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  return screen.findByRole("table", { name: "Roles" });
}

describe("RolesTab", () => {
  it("creates a custom role and saves a permission toggle", async () => {
    const table = await openRoles();
    const newRole = screen.getByRole("button", { name: "New role" });
    await waitFor(() => expect(newRole).toBeEnabled());
    fireEvent.click(newRole);
    const dialog = await screen.findByRole("dialog", { name: "New custom role" });
    fireEvent.change(within(dialog).getByLabelText(/Role name/), {
      target: { value: "Front desk" },
    });
    const matrix = within(dialog).getByRole("table", { name: "Permissions" });
    fireEvent.click(
      within(matrix).getByRole("checkbox", { name: "See users and people — Front desk" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const row = (await within(table).findByText("Front desk")).closest("tr")!;
    expect(within(row).getByText("Custom")).toBeInTheDocument();
    expect(within(row).getByText("1 permission")).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: "Edit role Front desk" }));
    const edit = await screen.findByRole("dialog", { name: "Edit custom role" });
    const editMatrix = within(edit).getByRole("table", { name: "Permissions" });
    fireEvent.click(
      within(editMatrix).getByRole("checkbox", { name: "Invite and manage users — Front desk" }),
    );
    fireEvent.click(within(edit).getByRole("button", { name: "Save" }));
    expect(await within(table).findByText("2 permissions")).toBeInTheDocument();
  });

  it("opens system roles read-only and marks sensitive permissions", async () => {
    const table = await openRoles();
    // The roles load after the table renders: wait for the row (slow under full-suite load).
    fireEvent.click(await within(table).findByRole("button", { name: "View role Owner" }));
    const dialog = await screen.findByRole("dialog", { name: "Owner (system role)" });
    const matrix = within(dialog).getByRole("table", { name: "Permissions" });
    expect(within(matrix).getAllByText("Sensitive").length).toBeGreaterThan(0);
    const cell = within(matrix).getByRole("checkbox", { name: /^See users and people — / });
    expect(cell).toHaveAttribute("aria-readonly", "true");
    expect(within(dialog).queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
