import { CALENDAR, PERSON, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { MODULES } from "../../app/modules";
import { freshDb, persona, renderApp, signInAs } from "../../test/renderApp";
import { LoadTab } from "./LoadTab";

async function openLoadTab(role: "admin" | "teacher" = "admin") {
  renderApp("/timetable", { as: persona(TENANT.riverside, role), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Teacher load" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("LoadTab (M16)", () => {
  it("resolves staff names for an admin and shows load, limits and Overloaded", async () => {
    server.use(
      http.get("*/api/v1/teacher-load", () =>
        HttpResponse.json({
          items: [
            {
              staffProfileId: "rp-rv-amira-staff",
              academicYearId: CALENDAR.riversideSchool,
              periodId: null,
              weeklyPeriods: 26,
              weeklyMinutes: 1300,
              maxWeeklyPeriods: 24,
              overloaded: true,
            },
            {
              staffProfileId: "rp-rv-tom-staff",
              academicYearId: CALENDAR.riversideSchool,
              periodId: null,
              weeklyPeriods: 6,
              weeklyMinutes: 300,
              maxWeeklyPeriods: null,
              overloaded: false,
            },
          ],
          total: 2,
          page: 1,
          pageSize: 200,
        }),
      ),
    );

    const firstStaff = mockDb.people.find((p) => p.id === PERSON.rvAmira)!;
    const secondStaff = mockDb.people.find((p) => p.id === PERSON.rvTom)!;
    const secondLabel = secondStaff.preferredName
      ? `${secondStaff.preferredName} (${secondStaff.legalName})`
      : secondStaff.legalName;

    await openLoadTab("admin");

    expect(await screen.findByText(firstStaff.legalName)).toBeInTheDocument();
    expect(screen.getByText("Overloaded")).toBeInTheDocument();
    expect(screen.getByText("26 periods / week")).toBeInTheDocument();
    expect(screen.getByText("1,300 min / week")).toBeInTheDocument();
    expect(screen.getByText("Max: 24 / week")).toBeInTheDocument();

    expect(screen.getByText(secondLabel)).toBeInTheDocument();
    expect(screen.getByText("6 periods / week")).toBeInTheDocument();
    expect(screen.getByText("300 min / week")).toBeInTheDocument();
    expect(screen.getByText("No limit")).toBeInTheDocument();
  });

  it("falls back to numbered staff labels when a teacher lacks directory read", async () => {
    const teacherRole = mockDb.roles.find(
      (role) => role.tenantId === TENANT.riverside && role.name === "Teacher",
    )!;
    teacherRole.permissions = teacherRole.permissions.filter((code) => code !== "m02.user.read");

    const teacher = mockDb.people.find((p) => p.id === PERSON.rvTom)!;
    const ownLabel = teacher.preferredName
      ? `${teacher.preferredName} (${teacher.legalName})`
      : teacher.legalName;

    await openLoadTab("teacher");

    expect(await screen.findByText(ownLabel)).toBeInTheDocument();
    expect(screen.getByText("Staff member 1")).toBeInTheDocument();
  });

  it("shows the existing no-access message when teacher-load returns 403", async () => {
    signInAs(persona(TENANT.riverside, "guardian"));
    render(
      <AppProviders
        db={freshDb()}
        createClient={() =>
          createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <LoadTab />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("shows empty state when no load rows exist and retries on error", async () => {
    server.use(
      http.get("*/api/v1/teacher-load", () =>
        HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 }),
      ),
    );
    await openLoadTab("admin");
    expect(
      await screen.findByRole("heading", { name: "Teacher load could not be loaded." }),
    ).toBeInTheDocument();

    server.use(
      http.get("*/api/v1/teacher-load", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "No teacher load recorded yet" }),
    ).toBeInTheDocument();
  });
});
