import { CALENDAR, INSTITUTION, PROGRAM, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

function openPrograms(role: "admin" | "teacher" = "teacher") {
  return renderApp("/academics/structure", {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

describe("ProgramsTab (M15)", () => {
  it("orders year levels by order and shows program kind, group code, kind and capacity", async () => {
    const rvLevels = mockDb.yearLevels.filter((yl) => yl.tenantId === TENANT.riverside);
    const others = mockDb.yearLevels.filter((yl) => yl.tenantId !== TENANT.riverside);
    mockDb.yearLevels = [...others, ...rvLevels.reverse()];
    openPrograms("admin");

    expect(await screen.findByText("Years 5 to 10")).toBeInTheDocument();
    expect(screen.getByText("School stage")).toBeInTheDocument();
    expect(screen.getAllByText("Y5")).toHaveLength(2);
    expect(screen.getAllByText("Section").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Capacity: 28").length).toBeGreaterThan(0);

    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["Year 5", "Year 7", "Year 9", "Year 10"]);
  });

  it("places batches without a year level under No year level", async () => {
    mockDb.classGroups.push({
      id: "clg-rv-bridge",
      tenantId: TENANT.riverside,
      institutionId: INSTITUTION.riversideSchool,
      campusId: null,
      academicYearId: CALENDAR.riversideSchool,
      programId: PROGRAM.riverside,
      yearLevelId: null,
      kind: "batch",
      code: "BRIDGE",
      name: "Summer Bridge Batch",
      capacity: null,
      homeroomStaffProfileId: null,
      createdAt: "2026-06-01T08:00:00Z",
      updatedAt: "2026-06-01T08:00:00Z",
    });
    openPrograms("teacher");

    expect(await screen.findByRole("heading", { level: 3, name: "No year level" })).toBeVisible();
    expect(screen.getByText("Summer Bridge Batch")).toBeInTheDocument();
    expect(screen.getByText("BRIDGE")).toBeInTheDocument();
    expect(screen.getByText("Batch")).toBeInTheDocument();
    expect(screen.getByText("Open capacity")).toBeInTheDocument();
  });

  it("shows an empty state when the tenant has no programs", async () => {
    mockDb.programs = mockDb.programs.filter((p) => p.tenantId !== TENANT.riverside);
    openPrograms("teacher");

    expect(await screen.findByRole("heading", { name: "No programs yet" })).toBeInTheDocument();
  });

  it("shows an error state and retries when loading programs fails", async () => {
    server.use(
      http.get("*/api/v1/programs", () =>
        HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 }),
      ),
    );
    openPrograms("teacher");

    expect(
      await screen.findByRole("heading", { name: "Academic structure could not be loaded." }),
    ).toBeInTheDocument();

    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Years 5 to 10")).toBeInTheDocument();
  });
});
