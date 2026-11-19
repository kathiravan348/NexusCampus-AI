import { TENANT } from "@nexus/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { persona, renderApp } from "../test/renderApp";

describe("Home", () => {
  it("welcomes the signed-in persona and renders tiles for visible modules", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    expect(await screen.findByRole("heading", { level: 1, name: /Priya/ })).toBeInTheDocument();
    const list = await screen.findByRole("region", { name: "Your modules" });
    expect(within(list).getByRole("link", { name: "User" })).toHaveAttribute("href", "/people");
  });

  it("renders an empty state when no modules are visible for the user", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin"), modules: [] });
    expect(await screen.findByRole("heading", { name: "No modules yet" })).toBeInTheDocument();
  });
});
