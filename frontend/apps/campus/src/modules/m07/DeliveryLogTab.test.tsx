import { TENANT } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("DeliveryLogTab", () => {
  it("filters deliveries by status", async () => {
    renderApp("/notifications", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const tab = await screen.findByRole("tab", { name: "Delivery log" });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const table = await screen.findByRole("table", { name: "Delivery log" });
    await waitFor(() => expect(within(table).getAllByRole("row").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });
    await waitFor(() => {
      const badges = within(table).queryAllByText(/^(Queued|Sent|Delivered|Not sent)$/);
      expect(badges).toHaveLength(0);
    });
  });
});
