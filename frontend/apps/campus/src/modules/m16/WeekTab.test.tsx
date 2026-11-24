import { CLASS_GROUP, OFFERING, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openWeek(role: "admin" | "teacher" = "teacher") {
  return renderApp("/timetable", {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

describe("WeekTab (M16)", () => {
  it("renders desktop grid and mobile weekday lists with subject, time and room", async () => {
    const tuesdaySlot = mockDb.timetableSlots.find(
      (slot) => slot.subjectOfferingId === OFFERING.rvSouthYearFive[1] && slot.weekday === 2,
    )!;
    tuesdaySlot.roomId = null;

    openWeek("teacher");

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Monday" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Tuesday" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Wednesday" })).toBeInTheDocument();
    expect(within(table).queryByRole("columnheader", { name: "Thursday" })).not.toBeInTheDocument();
    expect(within(table).getAllByText("English").length).toBeGreaterThan(0);
    expect(within(table).getByText("Mathematics")).toBeInTheDocument();
    expect(within(table).getAllByText("09:00–09:50").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("S101").length).toBeGreaterThan(0);
    expect(within(table).getByText("No room")).toBeInTheDocument();

    const mobile = screen.getByTestId("week-mobile-list");
    expect(within(mobile).getByRole("heading", { name: "Monday" })).toBeInTheDocument();
    expect(within(mobile).getByRole("heading", { name: "Tuesday" })).toBeInTheDocument();
    expect(within(mobile).getByText("Mathematics")).toBeInTheDocument();
    expect(within(mobile).getByText("No room")).toBeInTheDocument();
  });

  it("formats weekday headers from Intl in the active locale", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "hi-IN" }));
    const mondayHindi = new Intl.DateTimeFormat("hi-IN", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, 1, 12, 0, 0)));

    openWeek("teacher");

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: mondayHindi })).toBeInTheDocument();
  });

  it("shows an empty state when a class group has no slots", async () => {
    const yearFiveOfferings = new Set<string>(OFFERING.rvSouthYearFive);
    mockDb.timetableSlots = mockDb.timetableSlots.filter(
      (slot) => !yearFiveOfferings.has(slot.subjectOfferingId),
    );
    openWeek("teacher");

    expect(
      await screen.findByRole("heading", { name: "No timetable slots yet" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Class group"), {
      target: { value: CLASS_GROUP.rvNorthYearTen },
    });
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("shows an error state and retries when loading timetable slots fails", async () => {
    server.use(
      http.get("*/api/v1/timetable-slots", () =>
        HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 }),
      ),
    );
    openWeek("teacher");

    expect(
      await screen.findByRole("heading", { name: "Timetable slots could not be loaded." }),
    ).toBeInTheDocument();

    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});
