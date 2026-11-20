import { TENANT, mockDb, templateId } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("TemplatesTab", () => {
  it("lists templates by event and switches one off", async () => {
    renderApp("/notifications", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    const table = await screen.findByRole("table", { name: "Notification templates" });
    expect((await within(table).findAllByText("Account invitation")).length).toBeGreaterThan(0);
    const id = templateId(TENANT.riverside, "m07.announcement.published", "email", "en-GB");
    fireEvent.click(within(table).getByRole("switch", { name: `Template ${id} on` }));
    await waitFor(() =>
      expect(mockDb.notificationTemplates.find((t) => t.id === id)!.enabled).toBe(false),
    );
  });
});
