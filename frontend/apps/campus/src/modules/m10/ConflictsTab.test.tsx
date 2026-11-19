import { DEVICE, TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("ConflictsTab", () => {
  it("resolving removes the conflict from the open list and lowers the device count", async () => {
    const countBefore = mockDb.devices.find((d) => d.id === DEVICE.lsArjunTablet)!.conflictCount;
    renderApp("/sync", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Conflicts" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const table = await screen.findByRole("table", { name: "Sync conflicts" });
    const row = (await within(table).findByText("Phone number changed on both sides")).closest(
      "tr",
    )!;
    fireEvent.click(within(row).getByRole("button", { name: "Keep server" }));

    expect(await screen.findByText("Conflict resolved.")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(table).queryByText("Phone number changed on both sides"),
      ).not.toBeInTheDocument(),
    );
    expect(mockDb.devices.find((d) => d.id === DEVICE.lsArjunTablet)!.conflictCount).toBe(
      countBefore - 1,
    );

    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "resolved" } });
    expect(
      await within(table).findByText("Phone number changed on both sides"),
    ).toBeInTheDocument();
  });
});
