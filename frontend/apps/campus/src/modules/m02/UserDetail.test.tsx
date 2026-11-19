import { TENANT, roleId } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openUser(name: string) {
  renderApp("/access", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
  const table = await screen.findByRole("table", { name: "User accounts" });
  fireEvent.click(await within(table).findByRole("button", { name }));
  return screen.findByRole("dialog", { name });
}

describe("UserDetail", () => {
  it("lists assignments, adds a role and suspends the user", async () => {
    const dialog = await openUser("Arjun Mehta");
    expect(await within(dialog).findByText("Teacher", { selector: "p" })).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Role"), {
      target: { value: roleId(TENANT.littleSteps, "admin") },
    });
    fireEvent.change(within(dialog).getByLabelText("Applies to"), {
      target: { value: "institution" },
    });
    fireEvent.change(within(dialog).getByLabelText("Where"), { target: { value: "ins-ls" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add role" }));
    expect(await within(dialog).findByText("Administrator", { selector: "p" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Suspend" }));
    expect(await within(dialog).findByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(within(dialog).getByText("Suspended")).toBeInTheDocument();
  });

  it("protects your own account: no status change, last admin role cannot be removed", async () => {
    const dialog = await openUser("Priya Raman");
    expect(await within(dialog).findByText(/This is your account/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();

    fireEvent.click(await within(dialog).findByRole("button", { name: "Remove Owner" }));
    await screen.findByText("Role removed.");
    expect(within(dialog).getByRole("button", { name: "Remove Administrator" })).toBeDisabled();
  });
});
