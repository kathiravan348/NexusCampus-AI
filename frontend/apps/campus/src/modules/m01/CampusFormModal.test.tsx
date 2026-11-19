import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("CampusFormModal", () => {
  it("validates campus code format before submitting", async () => {
    renderApp("/setup", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    await screen.findByRole("heading", { level: 1, name: "Institution setup" });
    const tab = screen.getByRole("tab", { name: "Structure" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);

    fireEvent.click(await screen.findByRole("button", { name: "Add campus" }));
    const dialog = await screen.findByRole("dialog", { name: "Add campus" });
    fireEvent.change(within(dialog).getByLabelText(/Campus code/), {
      target: { value: "bad code!" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText(/Use A–Z, 0–9 and -/)).toBeInTheDocument();
  });
});
