import { TENANT, mockDb, templateId } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

async function openEditor(tenant: string, id: string) {
  renderApp("/notifications", { as: persona(tenant, "admin"), modules: MODULES });
  const table = await screen.findByRole("table", { name: "Notification templates" });
  // Wait for the screen's data (preferences → "Last synced"): its arrival re-renders the table rows.
  await screen.findByTestId("last-synced");
  fireEvent.click(await within(table).findByRole("button", { name: `Edit template ${id}` }));
  return { table, dialog: await screen.findByRole("dialog") };
}

describe("TemplateEditor", () => {
  it("blocks save on invalid ICU and previews valid text with sample values", async () => {
    const id = templateId(TENANT.riverside, "m02.user.invited", "in_app", "en-GB");
    const { dialog } = await openEditor(TENANT.riverside, id);
    const body = within(dialog).getByLabelText(/Message/);
    fireEvent.change(body, { target: { value: "Hello {name" } });
    expect(within(dialog).getByText(/Fix the message syntax/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(body, { target: { value: "Hello {name}" } });
    expect(within(dialog).getByText("Hello [name]")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("adds a missing Tamil version that then appears in the table", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.apex]: "en-IN" }));
    const taId = templateId(TENANT.apex, "m02.user.invited", "in_app", "ta-IN");
    mockDb.notificationTemplates.splice(
      mockDb.notificationTemplates.findIndex((t) => t.id === taId),
      1,
    );
    const enId = templateId(TENANT.apex, "m02.user.invited", "in_app", "en-IN");
    const { table, dialog } = await openEditor(TENANT.apex, enId);
    fireEvent.change(within(dialog).getByLabelText("Language"), { target: { value: "__new__" } });
    expect(within(dialog).getByLabelText("New language")).toHaveValue("ta-IN");
    const body = within(dialog).getByLabelText(/Message/);
    expect(body).toHaveAttribute("dir", "ltr");
    fireEvent.change(body, { target: { value: "வணக்கம் {name}" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Template saved.")).toBeInTheDocument();
    await waitFor(() => expect(within(table).getAllByText("ta-IN").length).toBeGreaterThan(0));
  });
});
