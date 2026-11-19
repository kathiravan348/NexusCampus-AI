import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openDevices() {
  renderApp("/sync", { as: persona(TENANT.littleSteps, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Devices" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  return screen.findByRole("table", { name: "Devices" });
}

describe("DevicesTab", () => {
  it("revokes a device after a confirm that states the writes to be lost", async () => {
    const table = await openDevices();
    const row = (await within(table).findByText("Classroom tablet")).closest("tr")!;
    expect(within(row).getByText("3 waiting")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Revoke and wipe Classroom tablet" }));

    const dialog = await screen.findByRole("dialog", { name: "Revoke and wipe Classroom tablet?" });
    expect(
      within(dialog).getByText("3 changes waiting on this device will be lost."),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke & wipe" }));

    expect(await screen.findByText("Wipe requested for Classroom tablet.")).toBeInTheDocument();
    const updated = (await within(table).findByText("Wipe pending")).closest("tr")!;
    expect(within(updated).getByText("3 lost")).toBeInTheDocument();
  });

  it("can be cancelled without changing the device", async () => {
    const table = await openDevices();
    const row = (await within(table).findByText("Office PC")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Revoke and wipe Office PC" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(within(row).getByText("Active")).toBeInTheDocument();
  });
});
