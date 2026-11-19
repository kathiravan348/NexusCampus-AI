import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("ConsentsTab", () => {
  it("lists consents with guardian and filters by purpose", async () => {
    renderApp("/privacy", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Consents" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const table = await screen.findByRole("table", { name: "Consent records" });
    expect(await within(table).findByText("Oliver Bennett")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "media_sharing" } });
    await waitFor(() =>
      expect(within(table).queryByText("Oliver Bennett")).not.toBeInTheDocument(),
    );
    const row = within(table).getByText("Leo Shah").closest("tr")!;
    expect(within(row).getByText("Photos and media")).toBeInTheDocument();
    expect(within(row).getByText("Pending")).toBeInTheDocument();
  });
});
