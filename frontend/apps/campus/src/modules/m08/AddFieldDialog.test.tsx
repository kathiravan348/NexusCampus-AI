import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openDialog() {
  renderApp("/forms", { modules: MODULES, as: persona(TENANT.riverside, "admin") });
  fireEvent.click(await screen.findByRole("button", { name: "Add custom field" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Add custom field" }));
  await dialog.findByLabelText(/Field key/);
  const locale = mockDb.institutions.find((row) => row.tenantId === TENANT.riverside)!.locale
    .defaultLocale;
  const labelName = new RegExp(`Label \\(${locale}\\)`);
  return { dialog, labelName };
}

function enter(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("Add custom field", () => {
  it("requires the default-language label and reports a duplicate key on the key input", async () => {
    const { dialog, labelName } = await openDialog();
    const existing = mockDb.customFieldDefinitions.find(
      (row) => row.tenantId === TENANT.riverside && row.entity === "learner",
    )!;
    const key = dialog.getByLabelText(/Field key/);
    enter(key, existing.key);
    const alternate = dialog
      .getAllByLabelText(/^Label /)
      .find((input) => !input.hasAttribute("required"));
    if (alternate) enter(alternate, "Translated label");
    const save = dialog.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await dialog.findByText("This field is required")).toBeVisible();
    enter(dialog.getByLabelText(labelName), "Test label");
    fireEvent.click(save);
    expect(
      await dialog.findByText("A field with this key already exists for this record type."),
    ).toBeVisible();
  });

  it("creates a two-option choice field and shows it under the selected record type", async () => {
    const { dialog, labelName } = await openDialog();
    enter(dialog.getByLabelText("Record type"), "staff");
    enter(dialog.getByLabelText(/Field key/), "workShift");
    enter(dialog.getByLabelText(labelName), "Shift preference");
    enter(dialog.getByLabelText("Field type"), "number");
    enter(dialog.getByLabelText("Minimum"), "3");
    enter(dialog.getByLabelText("Field type"), "choice");
    expect(dialog.queryByLabelText("Minimum")).toBeNull();
    for (const [index, value] of ["early", "late"].entries()) {
      fireEvent.click(dialog.getByRole("button", { name: "Add option" }));
      const option = within(dialog.getByRole("group", { name: `Option ${index + 1}` }));
      enter(option.getByLabelText(/Option key/), value);
      enter(option.getByLabelText(labelName), value);
    }
    const save = dialog.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await screen.findByText("Shift preference")).toBeVisible();
    expect(screen.getByLabelText("Record type")).toHaveValue("staff");
    const stored = mockDb.customFieldDefinitions.find((row) => row.key === "workShift");
    expect(stored?.options?.map((option) => option.value)).toEqual(["early", "late"]);
    expect(stored?.min).toBeUndefined();
  });
});
