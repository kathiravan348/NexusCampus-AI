import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("UsersTab", () => {
  it("masks a minor's contact for a teacher with a Restricted label", async () => {
    renderApp("/access", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    const table = await screen.findByRole("table", { name: "User accounts" });
    const row = (await within(table).findByText("Oliver Bennett")).closest("tr")!;
    expect(within(row).getByText("Restricted")).toBeInTheDocument();
    expect(within(row).queryByText(/@/)).not.toBeInTheDocument();
  });

  it("shows the minor's contact to an admin and filters by search and status", async () => {
    renderApp("/access", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const table = await screen.findByRole("table", { name: "User accounts" });
    const row = (await within(table).findByText("Oliver Bennett")).closest("tr")!;
    expect(within(row).getByText(/oliver\.bennett@/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "helen" } });
    expect(within(table).queryByText("Oliver Bennett")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "locked" } });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });
});
