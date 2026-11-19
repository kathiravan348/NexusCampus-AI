import { CAMPUS, TENANT, roleId } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openInvite() {
  renderApp("/access", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
  fireEvent.click(await screen.findByRole("button", { name: "Invite user" }));
  return screen.findByRole("dialog", { name: "Invite user" });
}

describe("InviteUserModal", () => {
  it("invites a user who then appears in the list as invited", async () => {
    const dialog = await openInvite();
    fireEvent.change(within(dialog).getByLabelText(/Full name/), {
      target: { value: "Neha Kapoor" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "neha.kapoor@littlesteps.example.in" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Role/), {
      target: { value: roleId(TENANT.littleSteps, "teacher") },
    });
    fireEvent.change(within(dialog).getByLabelText(/Applies to/), { target: { value: "campus" } });
    fireEvent.change(within(dialog).getByLabelText(/Where/), {
      target: { value: CAMPUS.littleSteps },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    const table = await screen.findByRole("table", { name: "User accounts" });
    const row = (await within(table).findByText("Neha Kapoor")).closest("tr")!;
    expect(within(row).getByText("Invited")).toBeInTheDocument();
  });

  it("validates required fields and a duplicate email", async () => {
    const dialog = await openInvite();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect((await within(dialog).findAllByText("This field is required")).length).toBeGreaterThan(
      0,
    );

    fireEvent.change(within(dialog).getByLabelText(/Full name/), { target: { value: "Again" } });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "priya.raman@littlesteps.example.edu" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Role/), {
      target: { value: roleId(TENANT.littleSteps, "guardian") },
    });
    fireEvent.change(within(dialog).getByLabelText(/Applies to/), { target: { value: "own" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(
      await within(dialog).findByText("This email already has an account."),
    ).toBeInTheDocument();
  });
});
