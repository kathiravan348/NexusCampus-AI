import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

function openStructureTab() {
  const tab = screen.getByRole("tab", { name: "Structure" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("StructureTab", () => {
  it("adds a new campus via the modal and updates the hierarchy tree", async () => {
    renderApp("/setup", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    await screen.findByRole("heading", { level: 1, name: "Institution setup" });
    openStructureTab();

    expect(await screen.findByText("Riverside School North")).toBeInTheDocument();
    expect(screen.getByText("Riverside School South")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add campus" }));
    const dialog = await screen.findByRole("dialog", { name: "Add campus" });

    fireEvent.change(within(dialog).getByLabelText(/Campus code/), {
      target: { value: "RV-WEST" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Campus name/), {
      target: { value: "West Campus" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Address line 1/), {
      target: { value: "10 Elm Lane" },
    });
    fireEvent.change(within(dialog).getByLabelText(/City/), { target: { value: "Bath" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("West Campus")).toBeInTheDocument();
    expect(screen.getByText("RV-WEST")).toBeInTheDocument();
  });

  it("edits an existing campus name", async () => {
    renderApp("/setup", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    await screen.findByRole("heading", { level: 1, name: "Institution setup" });
    openStructureTab();

    const editBtns = await screen.findAllByRole("button", { name: "Edit" });
    fireEvent.click(editBtns[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Edit campus" });
    fireEvent.change(within(dialog).getByLabelText(/Campus name/), {
      target: { value: "Little Steps Central" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Little Steps Central")).toBeInTheDocument();
  });
});
