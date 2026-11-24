import type { AcademicCalendar } from "@nexus/contracts";
import { CALENDAR, INSTITUTION, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openSubjectsTab(tenant: string = TENANT.riverside) {
  renderApp("/academics/structure", { as: persona(tenant, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Subjects" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("SubjectsTab (M15)", () => {
  it("lists subjects with code, name, kind and credits when present", async () => {
    await openSubjectsTab(TENANT.northbridge);

    expect((await screen.findAllByText("Programming Fundamentals")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("CS101").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Lab").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 credits").length).toBeGreaterThan(0);
  });

  it("filters subject offerings by academic year using calendars", async () => {
    (mockDb.calendars as AcademicCalendar[]).push({
      id: "cal-rv-2027",
      tenantId: TENANT.riverside,
      institutionId: INSTITUTION.riversideSchool,
      academicYear: "2027-28",
      startsOn: "2027-09-01",
      endsOn: "2028-07-21",
      periods: [],
      holidays: [],
      displayCalendar: "gregory",
    });

    await openSubjectsTab(TENANT.riverside);

    expect((await screen.findAllByText("Mathematics")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Year 5 South Section (Y5)")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 periods / week").length).toBeGreaterThan(0);

    const yearSelect = screen.getByLabelText("Academic year") as HTMLSelectElement;
    await waitFor(() =>
      expect([...yearSelect.options].map((option) => option.value)).toContain("cal-rv-2027"),
    );

    fireEvent.change(yearSelect, { target: { value: CALENDAR.riversideSchool } });
    expect((await screen.findAllByText("Year 5 South Section (Y5)")).length).toBeGreaterThan(0);

    fireEvent.change(yearSelect, { target: { value: "cal-rv-2027" } });
    expect(
      await screen.findByRole("heading", { name: "No subject offerings for this academic year." }),
    ).toBeInTheDocument();
  });

  it("shows an error state and retries when loading subjects fails", async () => {
    server.use(
      http.get("*/api/v1/subjects", () =>
        HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 }),
      ),
    );

    await openSubjectsTab(TENANT.riverside);
    expect(
      await screen.findByRole("heading", { name: "Academic structure could not be loaded." }),
    ).toBeInTheDocument();

    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByText("Mathematics")).length).toBeGreaterThan(0);
  });
});
