import { CLASS_GROUP, OFFERING, PERSON, ROOM, TENANT, mockDb } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { AddSlotDialog } from "./AddSlotDialog";

function renderDialog(options?: {
  readonly online?: boolean;
  readonly selectedClassGroupId?: string;
}) {
  const onOpenChange = vi.fn();
  const offerings = mockDb.subjectOfferings.filter((row) => row.tenantId === TENANT.riverside);
  const subjectsById = new Map(
    mockDb.subjects.filter((row) => row.tenantId === TENANT.riverside).map((row) => [row.id, row]),
  );
  const classGroupsById = new Map(
    mockDb.classGroups
      .filter((row) => row.tenantId === TENANT.riverside)
      .map((row) => [row.id, row]),
  );
  const rooms = mockDb.rooms.filter((row) => row.tenantId === TENANT.riverside);
  signInAs(persona(TENANT.riverside, "admin"));

  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddSlotDialog
        open
        onOpenChange={onOpenChange}
        online={options?.online ?? true}
        selectedClassGroupId={options?.selectedClassGroupId ?? CLASS_GROUP.rvSouthYearSeven}
        offerings={offerings}
        subjectsById={subjectsById}
        classGroupsById={classGroupsById}
        rooms={rooms}
      />
    </AppProviders>,
  );

  return { ...view, onOpenChange };
}

async function waitForDefaults(dialog: HTMLElement) {
  const effectiveInput = within(dialog).getByLabelText(/Effective from/) as HTMLInputElement;
  await waitFor(() => expect(effectiveInput.value).toBe("2026-09-01"));
}

describe("AddSlotDialog (M16)", () => {
  it("shows validation errors when end is not after start or date is missing", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Add timetable slot" });
    await waitForDefaults(dialog);

    fireEvent.change(within(dialog).getByLabelText(/Start time/), { target: { value: "10:00" } });
    fireEvent.change(within(dialog).getByLabelText(/End time/), { target: { value: "09:30" } });
    fireEvent.change(within(dialog).getByLabelText(/Effective from/), { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add slot" }));

    expect(
      await within(dialog).findByText("End time must be after start time."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("This field is required")).toBeInTheDocument();
  });

  it("maps 409 room, teacher and class group clashes to their respective fields", async () => {
    const { onOpenChange } = renderDialog({ selectedClassGroupId: CLASS_GROUP.rvSouthYearSeven });
    const dialog = await screen.findByRole("dialog", { name: "Add timetable slot" });
    await waitForDefaults(dialog);

    // Room clash: Year 7 South is free at Mon 09:00, but S101 is booked by Year 5 South.
    fireEvent.change(within(dialog).getByLabelText(/Weekday/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Start time/), { target: { value: "09:00" } });
    fireEvent.change(within(dialog).getByLabelText(/End time/), { target: { value: "09:50" } });
    fireEvent.change(within(dialog).getByLabelText("Room"), { target: { value: ROOM.rvSouth[0] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add slot" }));

    expect(
      await within(dialog).findByText("This room is already booked at this day and time."),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    // Teacher clash: clear room, select the South campus teacher who teaches Year 5 at Mon 09:00.
    const southTeacher = mockDb.people.find((p) => p.id === PERSON.rvAmira)!;
    fireEvent.change(within(dialog).getByLabelText("Room"), { target: { value: "" } });
    const teacherCheckbox = await within(dialog).findByRole("checkbox", {
      name: southTeacher.legalName,
    });
    fireEvent.click(teacherCheckbox);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add slot" }));

    expect(
      await within(dialog).findByText(
        "A selected teacher is already scheduled at this day and time.",
      ),
    ).toBeInTheDocument();

    // Class group clash: uncheck teacher and switch to Year 5 South offering at Mon 09:00.
    fireEvent.click(teacherCheckbox);
    fireEvent.change(within(dialog).getByLabelText(/Subject offering/), {
      target: { value: OFFERING.rvSouthYearFive[1] },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add slot" }));

    expect(
      await within(dialog).findByText("This class group already has a slot at this day and time."),
    ).toBeInTheDocument();
  });

  it("disables submission and shows the offline hint when offline", async () => {
    renderDialog({ online: false });
    const dialog = await screen.findByRole("dialog", { name: "Add timetable slot" });
    expect(within(dialog).getByRole("button", { name: "Add slot" })).toBeDisabled();
    expect(within(dialog).getByText("You are offline")).toBeInTheDocument();
  });
});
