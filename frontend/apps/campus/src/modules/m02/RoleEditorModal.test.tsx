import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("RoleEditorModal", () => {
  it("refuses to save a role without a name or permissions", async () => {
    renderApp("/access", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Roles" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const newRole = await screen.findByRole("button", { name: "New role" });
    await waitFor(() => expect(newRole).toBeEnabled());
    fireEvent.click(newRole);
    const dialog = await screen.findByRole("dialog", { name: "New custom role" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/Give the role a name/);
  });
});
