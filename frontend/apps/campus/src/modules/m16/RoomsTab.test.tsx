import { INSTITUTION, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openRoomsTab() {
  renderApp("/timetable", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Rooms & bells" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("RoomsTab (M16)", () => {
  it("lists rooms with code, kind, capacity, inactive badge and bell schedules", async () => {
    mockDb.rooms.push({
      id: "rom-rv-virtual",
      tenantId: TENANT.riverside,
      institutionId: INSTITUTION.riversideSchool,
      campusId: null,
      code: "ONLINE-1",
      name: "Virtual Seminar Room",
      kind: "online",
      capacity: null,
      active: false,
      createdAt: "2026-06-01T08:00:00Z",
      updatedAt: "2026-06-01T08:00:00Z",
    });

    await openRoomsTab();

    expect(await screen.findByText("North Science Lab")).toBeInTheDocument();
    expect(screen.getByText("N102")).toBeInTheDocument();
    expect(screen.getByText("Lab")).toBeInTheDocument();
    expect(screen.getByText("Capacity: 28")).toBeInTheDocument();

    expect(screen.getByText("Virtual Seminar Room")).toBeInTheDocument();
    expect(screen.getByText("ONLINE-1")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("Capacity: —")).toBeInTheDocument();

    expect(screen.getByText("Standard Weekday Bell Schedule")).toBeInTheDocument();
    expect(screen.getByText("Period 1")).toBeInTheDocument();
    expect(screen.getByText("09:00–09:50")).toBeInTheDocument();
    expect(screen.getAllByText("Break").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("10:50–11:10")).toBeInTheDocument();
  });

  it("shows empty states when no rooms or bell schedules exist", async () => {
    mockDb.rooms = mockDb.rooms.filter((row) => row.tenantId !== TENANT.riverside);
    mockDb.bellSchedules = mockDb.bellSchedules.filter((row) => row.tenantId !== TENANT.riverside);

    await openRoomsTab();

    expect(await screen.findByRole("heading", { name: "No rooms yet" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No bell schedules yet" })).toBeInTheDocument();
  });

  it("shows an error state and retries when loading rooms fails", async () => {
    server.use(
      http.get("*/api/v1/rooms", () =>
        HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 }),
      ),
    );

    await openRoomsTab();

    expect(
      await screen.findByRole("heading", {
        name: "Rooms and bell schedules could not be loaded.",
      }),
    ).toBeInTheDocument();

    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("North Science Lab")).toBeInTheDocument();
  });
});
