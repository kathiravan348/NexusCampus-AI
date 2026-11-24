import type { Program } from "@nexus/contracts";
import { CALENDAR, PROGRAM, TENANT, mockDb } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { AddClassGroupDialog } from "./AddClassGroupDialog";

function renderDialog(options?: { readonly online?: boolean; readonly programs?: Program[] }) {
  const onOpenChange = vi.fn();
  const programs =
    options?.programs ?? mockDb.programs.filter((row) => row.tenantId === TENANT.riverside);
  const yearLevels = mockDb.yearLevels.filter((row) => row.tenantId === TENANT.riverside);
  signInAs(persona(TENANT.riverside, "admin"));

  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddClassGroupDialog
        open
        onOpenChange={onOpenChange}
        online={options?.online ?? true}
        programs={programs}
        yearLevels={yearLevels}
      />
    </AppProviders>,
  );

  return { ...view, onOpenChange };
}

async function waitForCalendar(dialog: HTMLElement) {
  const select = within(dialog).getByLabelText(/Academic year/) as HTMLSelectElement;
  await waitFor(() =>
    expect([...select.options].map((o) => o.value)).toContain(CALENDAR.riversideSchool),
  );
  await waitFor(() => expect(select.value).toBe(CALENDAR.riversideSchool));
}

describe("AddClassGroupDialog (M15)", () => {
  it("shows localized validation errors for empty, malformed code and invalid capacity", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Add class group" });
    await waitForCalendar(dialog);

    fireEvent.click(within(dialog).getByRole("button", { name: "Create class group" }));
    expect((await within(dialog).findAllByText("This field is required")).length).toBeGreaterThan(
      0,
    );

    fireEvent.change(within(dialog).getByLabelText(/Code/), { target: { value: "bad code" } });
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Bad Code" } });
    fireEvent.change(within(dialog).getByLabelText(/Capacity/), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create class group" }));

    expect(
      await within(dialog).findByText("Enter a valid code starting with a letter or number."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Enter a whole number between 1 and 2,000."),
    ).toBeInTheDocument();
  });

  it("shows a conflict message on duplicate code for the same academic year", async () => {
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Add class group" });
    await waitForCalendar(dialog);

    fireEvent.change(within(dialog).getByLabelText(/Code/), { target: { value: "Y5" } });
    fireEvent.change(within(dialog).getByLabelText(/Name/), { target: { value: "Duplicate Y5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create class group" }));

    expect(
      await within(dialog).findByText(
        "A class group with this code already exists for this academic year.",
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows an invalid request error when submitting another tenant's program id", async () => {
    const otherProgram = mockDb.programs.find((row) => row.id === PROGRAM.littleSteps)!;
    const { onOpenChange } = renderDialog({ programs: [otherProgram] });
    const dialog = await screen.findByRole("dialog", { name: "Add class group" });
    await waitForCalendar(dialog);

    const programSelect = within(dialog).getByLabelText(/Program/) as HTMLSelectElement;
    await waitFor(() => expect(programSelect.value).toBe(PROGRAM.littleSteps));

    fireEvent.change(within(dialog).getByLabelText(/Code/), { target: { value: "CROSS-1" } });
    fireEvent.change(within(dialog).getByLabelText(/Name/), {
      target: { value: "Cross Tenant Group" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create class group" }));

    expect(
      await within(dialog).findByText("The selected program is not valid for this institution."),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("disables submission and shows the offline hint when offline", async () => {
    renderDialog({ online: false });
    const dialog = await screen.findByRole("dialog", { name: "Add class group" });
    expect(within(dialog).getByRole("button", { name: "Create class group" })).toBeDisabled();
    expect(within(dialog).getByText("You are offline")).toBeInTheDocument();
  });
});
