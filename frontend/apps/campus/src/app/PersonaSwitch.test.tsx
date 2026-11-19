import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { persona, renderApp } from "../test/renderApp";

describe("PersonaSwitch", () => {
  it("lists the tenant personas, marks the current user and switches persona", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    expect(await screen.findByRole("heading", { level: 1, name: /Priya/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch user" }));
    const dialog = await screen.findByRole("dialog", { name: "Switch user" });
    expect(within(dialog).getByRole("button", { name: /Administrator/ })).toBeDisabled();
    expect(within(dialog).getByText("Current")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Teacher" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Arjun/ })).toBeInTheDocument();
  });

  it("navigates to sign-in when clicking Switch institution", async () => {
    renderApp("/", { as: persona(TENANT.littleSteps, "admin") });
    fireEvent.click(await screen.findByRole("button", { name: "Switch user" }));
    const dialog = await screen.findByRole("dialog", { name: "Switch user" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Switch institution" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign in to a demo institution" }),
    ).toBeInTheDocument();
  });
});
