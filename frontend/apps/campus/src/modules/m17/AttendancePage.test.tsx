import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("AttendancePage", () => {
  it("opens the selected class session from the attendance menu route", async () => {
    const session = mockDb.attendanceSessions.find(
      (row) =>
        row.tenantId === TENANT.riverside && row.status === "open" && row.classGroupId !== null,
    )!;
    renderApp("/attendance", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "Attendance" })).toBeVisible();
    const group = await screen.findByLabelText("Class group");
    fireEvent.change(group, { target: { value: session.classGroupId } });
    const sessions = await screen.findByRole("heading", { name: "Attendance sessions" });
    const list = within(sessions.parentElement!);
    fireEvent.click((await list.findAllByRole("button", { name: /Open/ }))[0]!);
    expect(await screen.findByRole("heading", { name: "Roll call" })).toBeVisible();
    expect(screen.getByTestId("last-synced")).toBeVisible();
  });

  it("denies the attendance route to a guardian", async () => {
    renderApp("/attendance", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Attendance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all present" })).not.toBeInTheDocument();
  });
});
