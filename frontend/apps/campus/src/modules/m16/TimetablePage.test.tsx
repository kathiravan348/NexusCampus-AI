import { CLASS_GROUP, ROOM, TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openTimetable(role: "admin" | "teacher" | "guardian" | "learner" = "admin") {
  return renderApp("/timetable", {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

describe("TimetablePage (M16)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("lets a Riverside admin pick a class group, add a slot and see a room clash", async () => {
    openTimetable("admin");

    expect(await screen.findByRole("heading", { level: 1, name: "Timetable" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.getByRole("tab", { name: "Week" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Rooms & bells" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Teacher load" })).toBeInTheDocument();

    const groupSelect = (await screen.findByLabelText("Class group")) as HTMLSelectElement;
    expect(groupSelect.value).toBe(CLASS_GROUP.rvSouthYearFive);
    const table = await screen.findByRole("table");
    expect(within(table).getAllByText("English").length).toBeGreaterThan(0);

    fireEvent.change(groupSelect, { target: { value: CLASS_GROUP.rvNorthYearTen } });
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getByText("History")).toBeInTheDocument(),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const assistDialog = await screen.findByRole("dialog", { name: "Nexus Assist" });
    fireEvent.click(within(assistDialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Add slot" }));
    const dialog = await screen.findByRole("dialog", { name: "Add timetable slot" });
    const effectiveInput = within(dialog).getByLabelText(/Effective from/) as HTMLInputElement;
    await waitFor(() => expect(effectiveInput.value).toBe("2026-09-01"));

    fireEvent.change(within(dialog).getByLabelText(/Weekday/), { target: { value: "4" } });
    fireEvent.change(within(dialog).getByLabelText(/Start time/), { target: { value: "11:10" } });
    fireEvent.change(within(dialog).getByLabelText(/End time/), { target: { value: "12:00" } });
    fireEvent.change(within(dialog).getByLabelText("Room"), { target: { value: ROOM.rvNorth[0] } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add slot" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getByText("Thursday")).toBeInTheDocument(),
    );
    expect(within(screen.getByRole("table")).getAllByText("11:10–12:00").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Add slot" }));
    const clashDialog = await screen.findByRole("dialog", { name: "Add timetable slot" });
    const clashDate = within(clashDialog).getByLabelText(/Effective from/) as HTMLInputElement;
    await waitFor(() => expect(clashDate.value).toBe("2026-09-01"));

    fireEvent.change(within(clashDialog).getByLabelText(/Weekday/), { target: { value: "1" } });
    fireEvent.change(within(clashDialog).getByLabelText(/Start time/), {
      target: { value: "09:00" },
    });
    fireEvent.change(within(clashDialog).getByLabelText(/End time/), {
      target: { value: "09:50" },
    });
    fireEvent.change(within(clashDialog).getByLabelText("Room"), {
      target: { value: ROOM.rvNorth[0] },
    });
    fireEvent.click(within(clashDialog).getByRole("button", { name: "Add slot" }));

    expect(
      await within(clashDialog).findByText("This room is already booked at this day and time."),
    ).toBeInTheDocument();
  });

  it("lets a teacher see Week and Teacher load without Add slot", async () => {
    openTimetable("teacher");

    expect(await screen.findByRole("heading", { level: 1, name: "Timetable" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Week" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Teacher load" })).toBeInTheDocument();
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add slot" })).not.toBeInTheDocument();
  });

  it("limits a guardian to own children's class groups and hides Teacher load", async () => {
    openTimetable("guardian");

    expect(await screen.findByRole("heading", { level: 1, name: "Timetable" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Teacher load" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add slot" })).not.toBeInTheDocument();

    const groupSelect = (await screen.findByLabelText("Class group")) as HTMLSelectElement;
    const optionValues = [...groupSelect.options].map((option) => option.value);
    expect(optionValues).toEqual([CLASS_GROUP.rvSouthYearFive, CLASS_GROUP.rvNorthYearTen]);
  });

  it("hides Ask Assist when AI is switched off for the tenant", async () => {
    const settings = mockDb.aiSettings.find((row) => row.tenantId === TENANT.riverside)!;
    settings.enabled = false;
    openTimetable("admin");

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Assist" })).not.toBeInTheDocument();
  });

  it("keeps cached slots with Last synced and disables Add slot while offline", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    openTimetable("admin");

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Ask Assist" })).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: "Add slot" });
    expect(addButton).toBeEnabled();

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(addButton).toBeDisabled();
    expect(screen.getByText("You are offline")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Assist" })).not.toBeInTheDocument();
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openTimetable("admin");

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});
