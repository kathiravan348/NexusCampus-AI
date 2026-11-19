import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("PlanPage (M05)", () => {
  it("shows the current plan with the demo banner", async () => {
    renderApp("/plan", { as: persona(TENANT.northbridge, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Plan & usage" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Modules" })).toBeInTheDocument();
  });

  it("is closed to a teacher (no plan permission)", async () => {
    renderApp("/plan", { as: persona(TENANT.northbridge, "teacher"), modules: MODULES });
    expect(await screen.findByText("No access")).toBeInTheDocument();
  });
});
