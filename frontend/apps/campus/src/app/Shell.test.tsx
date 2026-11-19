import { TENANT } from "@nexus/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { persona, renderApp } from "../test/renderApp";

describe("Shell", () => {
  it("hides menu items the persona lacks permission for and hides unentitled modules", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "guardian") });
    expect(await screen.findByRole("heading", { level: 1, name: /Welcome/ })).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation")[0]!;
    await waitFor(() => {
      expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
    expect(within(nav).queryByRole("link", { name: "User" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Details" })).not.toBeInTheDocument();
  });

  it("shows DemoBanner and marks the active module link", async () => {
    renderApp("/people", { as: persona(TENANT.littleSteps, "admin") });
    expect(await screen.findByText("people screen")).toBeInTheDocument();
    const nav = screen.getAllByRole("navigation")[0]!;
    expect(within(nav).getByRole("link", { name: "User" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});
