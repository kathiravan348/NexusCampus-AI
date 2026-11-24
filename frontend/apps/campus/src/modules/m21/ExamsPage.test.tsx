import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("Exams page", () => {
  it("opens Schedule for staff and shows the last sync time", async () => {
    renderApp("/exams", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(await screen.findByRole("heading", { level: 1, name: "Exams" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Schedule" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Seating" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Hall tickets & re-evaluation" })).toBeVisible();
    expect(await screen.findByTestId("last-synced")).toBeVisible();
    expect(screen.getByRole("note")).toBeVisible();
  });

  it("opens the family tab directly for a guardian", async () => {
    renderApp("/exams", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    expect(
      await screen.findByRole("tab", { name: "Hall tickets & re-evaluation" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Schedule" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Seating" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate seating plan" })).toBeNull();
  });
});
