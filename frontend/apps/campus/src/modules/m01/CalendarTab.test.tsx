import { TENANT } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

function openCalendarTab() {
  const tab = screen.getByRole("tab", { name: "Calendar" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("CalendarTab", () => {
  it("shows a field error for overlapping periods and saves valid holiday edits", async () => {
    renderApp("/setup", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    await screen.findByRole("heading", { level: 1, name: "Institution setup" });
    openCalendarTab();

    expect(await screen.findByDisplayValue("Autumn term")).toBeInTheDocument();

    const endInputs = screen.getAllByLabelText(/Ends on/);
    // Make Autumn term end after Spring term begins (2027-01-05)
    fireEvent.change(endInputs[0]!, { target: { value: "2027-01-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Period overlaps "Autumn term"/)).toBeInTheDocument();

    // Restore valid end date, add a holiday, and save
    fireEvent.change(endInputs[0]!, { target: { value: "2026-12-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Add holiday" }));
    const holidayNames = screen.getAllByLabelText(/Holiday name/);
    fireEvent.change(holidayNames[holidayNames.length - 1]!, {
      target: { value: "Founders Day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Academic calendar saved.")).toBeInTheDocument();
  });
});
