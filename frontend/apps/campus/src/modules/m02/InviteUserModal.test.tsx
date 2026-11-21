import { CAMPUS, TENANT, roleId } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openInvite() {
  renderApp("/access", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
  fireEvent.click(await screen.findByRole("button", { name: "Invite user" }));
  return screen.findByRole("dialog", { name: "Invite user" });
}

/** Picks an option once it has loaded (role and campus options come from queries; slow under full-suite load). */
async function choose(dialog: HTMLElement, label: RegExp, value: string) {
  const select = (await within(dialog).findByLabelText(label)) as HTMLSelectElement;
  await waitFor(() => expect([...select.options].map((o) => o.value)).toContain(value));
  fireEvent.change(select, { target: { value } });
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
    await choose(dialog, /Role/, roleId(TENANT.littleSteps, "teacher"));
    await choose(dialog, /Applies to/, "campus");
    await choose(dialog, /Where/, CAMPUS.littleSteps);
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
    await choose(dialog, /Role/, roleId(TENANT.littleSteps, "guardian"));
    await choose(dialog, /Applies to/, "own");
    fireEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(
      await within(dialog).findByText("This email already has an account."),
    ).toBeInTheDocument();
  });
});
