import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

const nav = () => screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

describe("ModulesTab", () => {
  it("switching an optional module off hides its menu item; on restores it", async () => {
    renderApp("/plan", { as: persona(TENANT.northbridge, "admin"), modules: MODULES });
    await screen.findAllByRole("navigation", { name: "Main navigation" });
    expect(await within(nav()).findByRole("link", { name: "Sync centre" })).toBeInTheDocument();

    const table = await screen.findByRole("table", { name: "Modules" });
    const toggle = () => within(table).getByRole("switch", { name: "Turn Sync centre on" });
    await within(table).findByRole("switch", { name: "Turn Sync centre on" });
    expect(toggle()).toBeChecked();
    fireEvent.click(toggle());
    await waitFor(() =>
      expect(within(nav()).queryByRole("link", { name: "Sync centre" })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(toggle()).not.toBeChecked());
    await waitFor(() => expect(toggle()).toBeEnabled());

    fireEvent.click(toggle());
    expect(await within(nav()).findByRole("link", { name: "Sync centre" })).toBeInTheDocument();
  });

  it("locks core modules and marks modules outside the plan", async () => {
    renderApp("/plan", { as: persona(TENANT.harmony, "admin"), modules: MODULES });
    const table = await screen.findByRole("table", { name: "Modules" });
    expect(
      await within(table).findByRole("switch", { name: "Turn Institution setup on" }),
    ).toBeDisabled();
    const assist = within(table).getByText("Nexus Assist").closest("tr")!;
    expect(within(assist).getByText("Not in your plan")).toBeInTheDocument();
    expect(within(assist).getByRole("switch")).toBeDisabled();
    const notifications = within(table).getByText("Notifications").closest("tr")!;
    expect(within(notifications).getByText("Trial")).toBeInTheDocument();
    expect(within(notifications).getByText(/^Ends /)).toBeInTheDocument();
  });
});
